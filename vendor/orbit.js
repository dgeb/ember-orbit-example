define("orbit",
  ["orbit/lib/assert","orbit/lib/config","orbit/lib/diffs","orbit/lib/eq","orbit/lib/exceptions","orbit/lib/objects","orbit/lib/strings","orbit/lib/stubs","orbit/main","orbit/action_queue","orbit/document","orbit/evented","orbit/notifier","orbit/requestable","orbit/transaction","orbit/transformable","orbit/request_connector","orbit/transform_connector"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, Orbit, ActionQueue, Document, Evented, Notifier, Requestable, Transaction, Transformable, RequestConnector, TransformConnector) {
    "use strict";
    var assert = __dependency1__.assert;
    var arrayToOptions = __dependency2__.arrayToOptions;
    var diffs = __dependency3__.diffs;
    var eq = __dependency4__.eq;
    var PathNotFoundException = __dependency5__.PathNotFoundException;
    var clone = __dependency6__.clone;
    var expose = __dependency6__.expose;
    var extend = __dependency6__.extend;
    var capitalize = __dependency7__.capitalize;
    var noop = __dependency8__.noop;
    var required = __dependency8__.required;

    Orbit.ActionQueue = ActionQueue;
    Orbit.Document = Document;
    Orbit.Evented = Evented;
    Orbit.Notifier = Notifier;
    Orbit.Requestable = Requestable;
    Orbit.Transaction = Transaction;
    Orbit.Transformable = Transformable;
    Orbit.RequestConnector = RequestConnector;
    Orbit.TransformConnector = TransformConnector;
    // lib fns
    Orbit.assert = assert;
    Orbit.arrayToOptions = arrayToOptions;
    Orbit.diffs = diffs;
    Orbit.eq = eq;
    Orbit.PathNotFoundException = PathNotFoundException;
    Orbit.clone = clone;
    Orbit.expose = expose;
    Orbit.extend = extend;
    Orbit.capitalize = capitalize;
    Orbit.noop = noop;
    Orbit.required = required;

    return Orbit;
  });
define("orbit/action_queue",
  ["orbit/lib/assert","orbit/main","orbit/evented"],
  function(__dependency1__, Orbit, Evented) {
    "use strict";
    var assert = __dependency1__.assert;

    /**
     `ActionQueue` is a FIFO queue of actions that should be performed sequentially.

     All actions are calls to the same function and context. However, arguments for
     each call can vary in both value and length.

     If action calls return a promise, then that promise will be settled before the
     next action is de-queued and call. If action calls don't return anything, then
     the next action will be de-queued and called immediately.

     @example

     ``` javascript
     var transform = function(operation) {
       // perform operation here
     };

     var queue = new ActionQueue(transform);

     // push operations into queue synchronously so that they'll be performed
     // sequentially
     queue.push({op: 'add', path: ['planets', '123'], value: 'Mercury'});
     queue.push({op: 'add', path: ['planets', '234'], value: 'Venus'});
     ```

     @class ActionQueue
     @namespace Orbit
     @param {Function} fn Function to be called in order to process actions
     @param {Object}   [context] Context in which `fn` should be called
     @param {Object}   [options]
     @param {Boolean}  [options.autoProcess=true] Are actions automatically processed as soon as they are pushed?
     @constructor
     */
    var ActionQueue = function() {
      this.init.apply(this, arguments);
    };

    ActionQueue.prototype = {
      constructor: ActionQueue,

      init: function(fn, context, options) {
        assert('ActionQueue requires Orbit.Promise to be defined', Orbit.Promise);

        Evented.extend(this);

        this.fn = fn;
        this.context = context || this;

        options = options || {};
        this.autoProcess = options.autoProcess !== undefined ? options.autoProcess : true;

        this._queue = [];
        this.processing = false;
      },

      push: function() {
        var _this = this,
            args = arguments;

        var response = new Orbit.Promise(function(resolve) {
          var action = function() {
            var ret = _this.fn.apply(_this.context, args);
            if (ret) {
              return ret.then(
                function() {
                  resolve();
                }
              );
            } else {
              resolve();
            }
          };

          _this._queue.push(action);
        });

        if (this.autoProcess) this.process();

        return response;
      },

      process: function() {
        if (!this.processing) {
          var _this = this;

          _this.processing = true;

          var settleEach = function() {
            if (_this._queue.length === 0) {
              _this.processing = false;
              _this.emit('didComplete');

            } else {
              var action = _this._queue.shift();
              var ret = action.call(_this);

              if (ret) {
                return ret.then(
                  function(success) {
                    settleEach();
                  },
                  function(error) {
                    settleEach();
                  }
                );
              } else {
                settleEach();
              }
            }
          };

          settleEach();
        }
      },

      then: function(success, failure) {
        var self = this;

        return new Orbit.Promise(function(resolve) {
          if (self.processing) {
            self.one('didComplete', function () {
              resolve();
            });
          } else {
            resolve();
          }
        }).then(success, failure);
      }
    };

    return ActionQueue;
  });
define("orbit/document",
  ["orbit/lib/objects","orbit/lib/diffs","orbit/lib/eq","orbit/lib/exceptions"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__) {
    "use strict";
    var clone = __dependency1__.clone;
    var isArray = __dependency1__.isArray;
    var diffs = __dependency2__.diffs;
    var eq = __dependency3__.eq;
    var PathNotFoundException = __dependency4__.PathNotFoundException;

    /**
     `Document` is a complete implementation of the JSON PATCH spec detailed in
     [RFC 6902](http://tools.ietf.org/html/rfc6902).

     A document can be manipulated via a `transform` method that accepts an
     `operation`, or with the methods `add`, `remove`, `replace`, `move`, `copy` and
     `test`.

     Data at a particular path can be retrieved from a `Document` with `retrieve()`.

     @class Document
     @namespace Orbit
     @param {Object}  [data] The initial data for the document
     @param {Object}  [options]
     @param {Boolean} [options.arrayBasedPaths=false] Should paths be array based, or `'/'` delimited (the default)?
     @constructor
     */
    var Document = function() {
      this.init.apply(this, arguments);
    };

    Document.prototype = {
      constructor: Document,

      init: function(data, options) {
        options = options || {};
        this.arrayBasedPaths = options.arrayBasedPaths !== undefined ? options.arrayBasedPaths : false;
        this.reset(data);
      },

      /**
       Reset the contents of the whole document.

       If no data is specified, the contents of the document will be reset to an
       empty object.

       @method reset
       @param {Object} [data] New root object
       */
      reset: function(data) {
        this._data = data || {};
      },

      /**
       Retrieve the value at a path.

       Throws `PathNotFoundException` if the path does not exist in the document.

       @method retrieve
       @param {Array or String} path
       @returns {Object} Object at the specified `path`
       */
      retrieve: function(path) {
        return this._retrieve(this.deserializePath(path));
      },

      /**
       Sets the value at a path.

       If the target location specifies an array index, inserts a new value
       into the array at the specified index.

       If the target location specifies an object member that does not
       already exist, adds a new member to the object.

       If the target location specifies an object member that does exist,
       replaces that member's value.

       If the target location does not exist, throws `PathNotFoundException`.

       @method add
       @param {Array or String} path
       @param {Object} value
       @param {Boolean} [invert=false] Return the inverse operations?
       @returns {Array} Array of inverse operations if `invert === true`
       */
      add: function(path, value, invert) {
        return this._add(this.deserializePath(path), value, invert);
      },

      /**
       Removes the value from a path.

       If removing an element from an array, shifts any elements above the
       specified index one position to the left.

       If the target location does not exist, throws `PathNotFoundException`.

       @method remove
       @param {Array or String} path
       @param {Boolean} [invert=false] Return the inverse operations?
       @returns {Array} Array of inverse operations if `invert === true`
       */
      remove: function(path, invert) {
        return this._remove(this.deserializePath(path), invert);
      },

      /**
       Replaces the value at a path.

       This operation is functionally identical to a "remove" operation for
       a value, followed immediately by an "add" operation at the same
       location with the replacement value.

       If the target location does not exist, throws `PathNotFoundException`.

       @method replace
       @param {Array or String} path
       @param {Object} value
       @param {Boolean} [invert=false] Return the inverse operations?
       @returns {Array} Array of inverse operations if `invert === true`
       */
      replace: function(path, value, invert) {
        return this._replace(this.deserializePath(path), value, invert);
      },

      /**
       Moves an object from one path to another.

       Identical to calling `remove()` followed by `add()`.

       Throws `PathNotFoundException` if either path does not exist in the document.

       @method move
       @param {Array or String} fromPath
       @param {Array or String} toPath
       @param {Boolean} [invert=false] Return the inverse operations?
       @returns {Array} Array of inverse operations if `invert === true`
       */
      move: function(fromPath, toPath, invert) {
        return this._move(this.deserializePath(fromPath), this.deserializePath(toPath), invert);
      },

      /**
       Copies an object at one path and adds it to another.

       Identical to calling `add()` with the value at `fromPath`.

       Throws `PathNotFoundException` if either path does not exist in the document.

       @method copy
       @param {Array or String} fromPath
       @param {Array or String} toPath
       @param {Boolean} [invert=false] Return the inverse operations?
       @returns {Array} Array of inverse operations if `invert === true`
       */
      copy: function(fromPath, toPath, invert) {
        return this._copy(this.deserializePath(fromPath), this.deserializePath(toPath), invert);
      },

      /**
       Tests that the value at a path matches an expectation.

       Uses `Orbit.eq` to test equality.

       Throws `PathNotFoundException` if the path does not exist in the document.

       @method test
       @param {Array or String} path
       @param {Object} value Expected value to test
       @returns {Boolean} Does the value at `path` equal `value`?
       */
      test: function(path, value) {
        return eq(this._retrieve(this.deserializePath(path)), value);
      },

      /**
       Transforms the document with an RFC 6902-compliant operation.

       Throws `PathNotFoundException` if the path does not exist in the document.

       @method transform
       @param {Object} operation
       @param {String} operation.op Must be "add", "remove", "replace", "move", "copy", or "test"
       @param {Array or String} operation.path Path to target location
       @param {Array or String} operation.from Path to source target location. Required for "copy" and "move"
       @param {Object} operation.value Value to set. Required for "add", "replace" and "test"
       @param {Boolean} [invert=false] Return the inverse operations?
       @returns {Array} Array of inverse operations if `invert === true`
       */
      transform: function(operation, invert) {
        if (operation.op === 'add') {
          return this.add(operation.path, operation.value, invert);

        } else if (operation.op === 'remove') {
          return this.remove(operation.path, invert);

        } else if (operation.op === 'replace') {
          return this.replace(operation.path, operation.value, invert);

        } else if (operation.op === 'move') {
          return this.move(operation.from, operation.path, invert);

        } else if (operation.op === 'copy') {
          return this.copy(operation.from, operation.path, invert);

        } else if (operation.op === 'test') {
          return this.copy(operation.path, operation.value);
        }
      },

      serializePath: function(path) {
        if (this.arrayBasedPaths) {
          return path;

        } else {
          if (path.length === 0) {
            return '/';
          } else {
            return '/' + path.join('/');
          }
        }
      },

      deserializePath: function(path) {
        if (typeof path === 'string') {
          if (path.indexOf('/') === 0) {
            path = path.substr(1);
          }

          if (path.length === 0) {
            return [];
          } else {
            return path.split('/');
          }

        } else {
          return path;
        }
      },

      /////////////////////////////////////////////////////////////////////////////
      // Internals
      /////////////////////////////////////////////////////////////////////////////

      _pathNotFound: function(path) {
        throw new PathNotFoundException(this.serializePath(path));
      },

      _retrieve: function(path) {
        var ptr = this._data,
            segment;
        if (path) {
          for (var i = 0, len = path.length; i < len; i++) {
            segment = path[i];
            if (isArray(ptr)) {
              if (segment === '-') {
                ptr = ptr[ptr.length-1];
              } else {
                ptr = ptr[parseInt(segment, 10)];
              }
            } else {
              ptr = ptr[segment];
            }
            if (ptr === undefined) {
              this._pathNotFound(path);
            }
          }
        }
        return ptr;
      },

      _add: function(path, value, invert) {
        var inverse;
        value = clone(value);
        if (path.length > 0) {
          var parentKey = path[path.length-1];
          if (path.length > 1) {
            var grandparent = this._retrieve(path.slice(0, -1));
            if (isArray(grandparent)) {
              if (parentKey === '-') {
                if (invert) {
                  inverse = [{op: 'remove', path: this.serializePath(path)}];
                }
                grandparent.push(value);
              } else {
                var parentIndex = parseInt(parentKey, 10);
                if (parentIndex > grandparent.length) {
                  this._pathNotFound(path);
                } else {
                  if (invert) {
                    inverse = [{op: 'remove', path: this.serializePath(path)}];
                  }
                  grandparent.splice(parentIndex, 0, value);
                }
              }
            } else {
              if (invert) {
                if (grandparent.hasOwnProperty(parentKey)) {
                  inverse = [{op: 'replace', path: this.serializePath(path), value: clone(grandparent[parentKey])}];
                } else {
                  inverse = [{op: 'remove', path: this.serializePath(path)}];
                }
              }
              grandparent[parentKey] = value;
            }
          } else {
            if (invert) {
              if (this._data.hasOwnProperty(parentKey)) {
                inverse = [{op: 'replace', path: this.serializePath(path), value: clone(this._data[parentKey])}];
              } else {
                inverse = [{op: 'remove', path: this.serializePath(path)}];
              }
            }
            this._data[parentKey] = value;
          }
        } else {
          if (invert) {
            inverse = [{op: 'replace', path: this.serializePath([]), value: clone(this._data)}];
          }
          this._data = value;
        }
        return inverse;
      },

      _remove: function(path, invert) {
        var inverse;
        if (path.length > 0) {
          var parentKey = path[path.length-1];
          if (path.length > 1) {
            var grandparent = this._retrieve(path.slice(0, -1));
            if (isArray(grandparent)) {
              if (grandparent.length > 0) {
                if (parentKey === '-') {
                  if (invert) {
                    inverse = [{op: 'add', path: this.serializePath(path), value: clone(grandparent.pop())}];
                  } else {
                    grandparent.pop();
                  }
                } else {
                  var parentIndex = parseInt(parentKey, 10);
                  if (grandparent[parentIndex] === undefined) {
                    this._pathNotFound(path);
                  } else {
                    if (invert) {
                      inverse = [{op: 'add', path: this.serializePath(path), value: clone(grandparent.splice(parentIndex, 1)[0])}];
                    } else {
                      grandparent.splice(parentIndex, 1);
                    }
                  }
                }
              } else {
                this._pathNotFound(path);
              }

            } else if (grandparent[parentKey] === undefined) {
              this._pathNotFound(path);

            } else {
              if (invert) {
                inverse = [{op: 'add', path: this.serializePath(path), value: clone(grandparent[parentKey])}];
              }
              delete grandparent[parentKey];
            }
          } else if (this._data[parentKey] === undefined) {
            this._pathNotFound(path);

          } else {
            if (invert) {
              inverse = [{op: 'add', path: this.serializePath(path), value: clone(this._data[parentKey])}];
            }
            delete this._data[parentKey];
          }
        } else {
          if (invert) {
            inverse = [{op: 'add', path: this.serializePath(path), value: clone(this._data)}];
          }
          this._data = {};
        }
        return inverse;
      },

      _replace: function(path, value, invert) {
        var inverse;
        value = clone(value);
        if (path.length > 0) {
          var parentKey = path[path.length-1];
          if (path.length > 1) {
            var grandparent = this._retrieve(path.slice(0, -1));
            if (isArray(grandparent)) {
              if (grandparent.length > 0) {
                if (parentKey === '-') {
                  if (invert) {
                    inverse = [{op: 'replace', path: this.serializePath(path), value: clone(grandparent[grandparent.length-1])}];
                  }
                  grandparent[grandparent.length-1] = value;
                } else {
                  var parentIndex = parseInt(parentKey, 10);
                  if (grandparent[parentIndex] === undefined) {
                    this._pathNotFound(path);
                  } else {
                    if (invert) {
                      inverse = [{op: 'replace', path: this.serializePath(path), value: clone(grandparent.splice(parentIndex, 1, value)[0])}];
                    } else {
                      grandparent.splice(parentIndex, 1, value);
                    }
                  }
                }
              } else {
                this._pathNotFound(path);
              }

            } else if (grandparent[parentKey] === undefined) {
              this._pathNotFound(path);

            } else {
              if (invert) {
                inverse = [{op: 'replace', path: this.serializePath(path), value: clone(grandparent[parentKey])}];
              }
              grandparent[parentKey] = value;
            }
          } else if (this._data[parentKey] === undefined) {
            this._pathNotFound(path);

          } else {
            if (invert) {
              inverse = [{op: 'replace', path: this.serializePath(path), value: clone(this._data[parentKey])}];
            }
            this._data[parentKey] = value;
          }
        } else {
          if (invert) {
            inverse = [{op: 'replace', path: this.serializePath([]), value: clone(this._data)}];
          }
          this._data = value;
        }
        return inverse;
      },

      _move: function(fromPath, toPath, invert) {
        if (eq(fromPath, toPath)) {
          if (invert) return [];
          return;

        } else {
          var value = this._retrieve(fromPath);
          if (invert) {
            return this._remove(fromPath, true)
                .concat(this._add(toPath, value, true))
                .reverse();

          } else {
            this._remove(fromPath);
            this._add(toPath, value);
          }
        }
      },

      _copy: function(fromPath, toPath, invert) {
        if (eq(fromPath, toPath)) {
          if (invert) return [];
          return;

        } else {
          return this._add(toPath, this._retrieve(fromPath), invert);
        }
      }
    };

    return Document;
  });
define("orbit/evented",
  ["orbit/lib/assert","orbit/lib/objects","orbit/main","orbit/notifier"],
  function(__dependency1__, __dependency2__, Orbit, Notifier) {
    "use strict";
    var assert = __dependency1__.assert;
    var extend = __dependency2__.extend;

    var notifierForEvent = function(object, eventName, createIfUndefined) {
      var notifier = object._eventedNotifiers[eventName];
      if (!notifier && createIfUndefined) {
        notifier = object._eventedNotifiers[eventName] = new Notifier();
      }
      return notifier;
    };

    var removeNotifierForEvent = function(object, eventName) {
      delete object._eventedNotifiers[eventName];
    };

    /**
     The `Evented` interface uses notifiers to add events to an object. Like
     notifiers, events will send along all of their arguments to subscribed
     listeners.

     The `Evented` interface can extend an object or prototype as follows:

     ```javascript
     var source = {};
     Orbit.Evented.extend(source);
     ```

     Listeners can then register themselves for particular events with `on`:

     ```javascript
     var listener1 = function(message) {
           console.log('listener1 heard ' + message);
         },
         listener2 = function(message) {
           console.log('listener2 heard ' + message);
         };

     source.on('greeting', listener1);
     source.on('greeting', listener2);

     evented.emit('greeting', 'hello'); // logs "listener1 heard hello" and
                                        //      "listener2 heard hello"
     ```

     Listeners can be unregistered from events at any time with `off`:

     ```javascript
     source.off('greeting', listener2);
     ```

     A listener can register itself for multiple events at once:

     ```javascript
     source.on('greeting salutation', listener2);
     ```

     And multiple events can be triggered sequentially at once,
     assuming that you want to pass them all the same arguments:

     ```javascript
     source.emit('greeting salutation', 'hello', 'bonjour', 'guten tag');
     ```

     Last but not least, listeners can be polled
     (note that spaces can't be used in event names):

     ```javascript
     source.on('question', function(question) {
       if (question === 'favorite food?') return 'beer';
     });

     source.on('question', function(question) {
       if (question === 'favorite food?') return 'wasabi almonds';
     });

     source.on('question', function(question) {
       // this listener doesn't return anything, and therefore won't participate
       // in the poll
     });

     source.poll('question', 'favorite food?'); // returns ['beer', 'wasabi almonds']
     ```

     @class Evented
     @namespace Orbit
     @extension
     @constructor
     */
    var Evented = {
      /**
       Mixes the `Evented` interface into an object

       @method extend
       @param {Object} object Object to extend
       @returns {Object} Extended object
       */
      extend: function(object) {
        assert('Evented requires Orbit.Promise be defined', Orbit.Promise);

        if (object._evented === undefined) {
          extend(object, this.interface);
          object._eventedNotifiers = {};
        }
        return object;
      },

      interface: {
        _evented: true,

        on: function(eventNames, callback, binding) {
          binding = binding || this;

          eventNames.split(/\s+/).forEach(function(eventName) {
            notifierForEvent(this, eventName, true).addListener(callback, binding);
          }, this);
        },

        off: function(eventNames, callback, binding) {
          var notifier;

          binding = binding || this;

          eventNames.split(/\s+/).forEach(function(eventName) {
            notifier = notifierForEvent(this, eventName);
            if (notifier) {
              if (callback) {
                notifier.removeListener(callback, binding);
              } else {
                removeNotifierForEvent(this, eventName);
              }
            }
          }, this);
        },

        one: function(eventName, callback, binding) {
          var callOnce,
              notifier;

          binding = binding || this;

          notifier = notifierForEvent(this, eventName, true);

          callOnce = function() {
            callback.apply(binding, arguments);
            notifier.removeListener(callOnce, binding);
          };

          notifier.addListener(callOnce, binding);
        },

        emit: function(eventNames) {
          var args = Array.prototype.slice.call(arguments, 1),
              notifier;

          eventNames.split(/\s+/).forEach(function(eventName) {
            notifier = notifierForEvent(this, eventName);
            if (notifier) {
              notifier.emit.apply(notifier, args);
            }
          }, this);
        },

        poll: function(eventNames) {
          var args = Array.prototype.slice.call(arguments, 1),
              notifier,
              responses = [];

          eventNames.split(/\s+/).forEach(function(eventName) {
            notifier = notifierForEvent(this, eventName);
            if (notifier) {
              responses = responses.concat(notifier.poll.apply(notifier, args));
            }
          }, this);

          return responses;
        },

        listeners: function(eventNames) {
          var notifier,
              listeners = [];

          eventNames.split(/\s+/).forEach(function(eventName) {
            notifier = notifierForEvent(this, eventName);
            if (notifier) {
              listeners = listeners.concat(notifier.listeners);
            }
          }, this);

          return listeners;
        },

        resolve: function(eventNames) {
          var listeners = this.listeners(eventNames),
              args = Array.prototype.slice.call(arguments, 1);

          return new Orbit.Promise(function(resolve, reject) {
            var resolveEach = function() {
              if (listeners.length === 0) {
                reject();
              } else {
                var listener = listeners.shift();
                var response = listener[0].apply(listener[1], args);

                if (response) {
                  response.then(
                    function(success) {
                      resolve(success);
                    },
                    function(error) {
                      resolveEach();
                    }
                  );
                } else {
                  resolveEach();
                }
              }
            };

            resolveEach();
          });
        },

        settle: function(eventNames) {
          var listeners = this.listeners(eventNames),
              args = Array.prototype.slice.call(arguments, 1);

          return new Orbit.Promise(function(resolve) {
            var settleEach = function() {
              if (listeners.length === 0) {
                resolve();
              } else {
                var listener = listeners.shift(),
                    response = listener[0].apply(listener[1], args);

                if (response) {
                  return response.then(
                    function(success) {
                      settleEach();
                    },
                    function(error) {
                      settleEach();
                    }
                  );
                } else {
                  settleEach();
                }
              }
            };

            settleEach();
          });
        }
      }
    };

    return Evented;
  });
define("orbit/lib/assert",
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     Throw an exception if `test` is not truthy.

     @method assert
     @for Orbit
     @param desc Description of the error thrown
     @param test Value that should be truthy for assertion to pass
     */
    var assert = function(desc, test) {
      if (!test) throw new Error("Assertion failed: " + desc);
    };


    __exports__.assert = assert;
  });
define("orbit/lib/config",
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     Converts an array of values to an object with those values as properties
     having a value of `true`.

     This is useful for converting an array of settings to a more efficiently
     accessible settings object.

     @example

     ``` javascript
     Orbit.arrayToOptions(['a', 'b']); // returns {a: true, b: true}
     ```

     @method arrayToOptions
     @for Orbit
     @param {Array} a
     @returns {Object} Set of options, keyed by the elements in `a`
     */
    var arrayToOptions = function(a) {
      var options = {};
      if (a) {
        for (var i in a) {
          if (a.hasOwnProperty(i)) options[a[i]] = true;
        }
      }
      return options;
    };


    __exports__.arrayToOptions = arrayToOptions;
  });
define("orbit/lib/diffs",
  ["orbit/lib/eq","orbit/lib/objects","orbit/lib/config","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var eq = __dependency1__.eq;
    var clone = __dependency2__.clone;
    var isArray = __dependency2__.isArray;
    var arrayToOptions = __dependency3__.arrayToOptions;

    /**
     Determines the patch operations required to convert one object to another.

     See [RFC 6902](http://tools.ietf.org/html/rfc6902) for a description of patch
     operations and a full set of examples.

     @example

     ``` javascript
     var a, b;

     a = {foo: 'bar'};
     b = {foo: 'bar', 'baz': 'qux'};

     Orbit.diffs(a, b); // [{op: 'add', path: '/baz', value: 'qux'}]
     ```

     @method diffs
     @for Orbit
     @param a
     @param b
     @param {Object} [options]
     @param {Array}  [options.ignore] Properties to ignore
     @param {String} [options.basePath] A base path to be prefixed to all paths in return patch operations
     @returns {Array} Array of patch operations to get from `a` to `b` (or undefined if they are equal)
     */
    var diffs = function(a, b, options) {
      if (a === b) {
        return undefined;

      } else {
        options = options || {};

        var ignore = arrayToOptions(options.ignore),
            basePath = options.basePath || '';

        if (isArray(basePath)) {
          basePath = basePath.join('/');
        }

        var type = Object.prototype.toString.call(a);
        if (type === Object.prototype.toString.call(b)) {
          if (typeof a === 'object') {
            var i,
                d;

            if (isArray(a)) {
              var aLength = a.length,
                  bLength = b.length,
                  maxLength = bLength > aLength ? bLength : aLength,
                  match,
                  ai = 0,
                  bi = 0,
                  bj;

              for (i = 0; i < maxLength; i++) {
                if (ai >= aLength) {
                  if (d === undefined) d = [];
                  d.push({op: 'add', path: basePath + '/' + bi, value: clone(b[bi])});
                  bi++;

                } else if (bi >= bLength) {
                  if (d === undefined) d = [];
                  d.push({op: 'remove', path: basePath + '/' + ai});
                  ai++;

                } else if (!eq(a[ai], b[bi])) {
                  match = -1;
                  for (bj = bi + 1; bj < bLength; bj++) {
                    if (eq(a[ai], b[bj])) {
                      match = bj;
                      break;
                    }
                  }
                  if (match === -1) {
                    if (d === undefined) d = [];
                    d.push({op: 'remove', path: basePath + '/' + ai});
                    ai++;

                  } else {
                    if (d === undefined) d = [];
                    d.push({op: 'add', path: basePath + '/' + bi, value: clone(b[bi])});
                    bi++;
                  }
                } else {
                  ai++;
                  bi++;
                }
              }

            } else { // general (non-array) object
              for (i in b) {
                if (!ignore[i] && b.hasOwnProperty(i)) {
                  if (a[i] === undefined) {
                    if (d === undefined) d = [];
                    d.push({op: 'add', path: basePath + '/' + i, value: clone(b[i])});

                  } else if (!eq(a[i], b[i])) {
                    if (d === undefined) d = [];
                    d = d.concat(diffs(a[i], b[i], {basePath: basePath + '/' + i}));
                  }
                }
              }

              for (i in a) {
                if (!ignore[i] && a.hasOwnProperty(i)) {
                  if (b[i] === undefined) {
                    if (d === undefined) d = [];
                    d.push({op: 'remove', path: basePath + '/' + i});
                  }
                }
              }
            }

            return d;

          } else if (eq(a, b)) {
            return undefined;
          }
        }

        return [{op: 'replace', path: basePath, value: clone(b)}];
      }
    };

    __exports__.diffs = diffs;
  });
define("orbit/lib/eq",
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     `eq` checks the equality of two objects.

     The properties belonging to objects (but not their prototypes) will be
     traversed deeply and compared.

     Includes special handling for strings, numbers, dates, booleans, regexes, and
     arrays.

     @method eq
     @for Orbit
     @param a
     @param b
     @returns {Boolean} are `a` and `b` equal?
     */
    var eq = function(a, b) {
      // Some elements of this function come from underscore
      // (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
      //
      // https://github.com/jashkenas/underscore/blob/master/underscore.js

      // Identical objects are equal. `0 === -0`, but they aren't identical.
      // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
      if (a === b) return a !== 0 || 1 / a == 1 / b;
      // A strict comparison is necessary because `null == undefined`.
      if (a == null || b == null) return a === b;

      var type = Object.prototype.toString.call(a);
      if (type !== Object.prototype.toString.call(b)) return false;

      switch(type) {
        case '[object String]':
          return a == String(b);
        case '[object Number]':
          // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
          // other numeric values.
          return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
        case '[object Date]':
        case '[object Boolean]':
          // Coerce dates and booleans to numeric primitive values. Dates are compared by their
          // millisecond representations. Note that invalid dates with millisecond representations
          // of `NaN` are not equivalent.
          return +a == +b;
        // RegExps are compared by their source patterns and flags.
        case '[object RegExp]':
          return a.source == b.source &&
                 a.global == b.global &&
                 a.multiline == b.multiline &&
                 a.ignoreCase == b.ignoreCase;
      }
      if (typeof a != 'object' || typeof b != 'object') return false;

      if (type === '[object Array]') {
        if (a.length !== b.length) return false;
      }

      var d, i;
      for (i in b) {
        if (b.hasOwnProperty(i)) {
          if (!eq(a[i], b[i])) return false;
        }
      }
      for (i in a) {
        if (a.hasOwnProperty(i)) {
          if (!eq(a[i], b[i])) return false;
        }
      }
      return true;
    };

    __exports__.eq = eq;
  });
define("orbit/lib/exceptions",
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     Exception thrown when a path in a document can not be found.

     @class PathNotFoundException
     @namespace Orbit
     @param {String} path
     @constructor
     */
    var PathNotFoundException = function(path) {
      this.path = path;
    };

    PathNotFoundException.prototype = {
      constructor: PathNotFoundException
    };

    __exports__.PathNotFoundException = PathNotFoundException;
  });
define("orbit/lib/objects",
  ["orbit/lib/eq","exports"],
  function(__dependency1__, __exports__) {
    "use strict";
    var eq = __dependency1__.eq;

    /**
     Creates a deeply nested clone of an object.

     Traverses all object properties (but not prototype properties).

     @method clone
     @for Orbit
     @param {Object} obj
     @returns {Object} Clone of the original object
     */
    var clone = function(obj) {
      if (obj === undefined || obj === null || typeof obj !== 'object') return obj;

      var dup,
          type = Object.prototype.toString.call(obj);

      if (type === "[object Date]") {
        dup = new Date();
        dup.setTime(obj.getTime());

      } else if (type === "[object RegExp]") {
        dup = obj.constructor(obj);

      } else if (type === "[object Array]") {
        dup = [];
        for (var i = 0, len = obj.length; i < len; i++) {
          if (obj.hasOwnProperty(i)) {
            dup.push(clone(obj[i]));
          }
        }

      } else  {
        var val;

        dup = {};
        for (var key in obj) {
          if (obj.hasOwnProperty(key)) {
            val = obj[key];
            if (typeof val === 'object') val = clone(val);
            dup[key] = val;
          }
        }
      }
      return dup;
    };

    /**
     Expose properties and methods from one object on another.

     Methods will be called on `source` and will maintain `source` as the
     context.

     @method expose
     @for Orbit
     @param {Object} destination
     @param {Object} source
     */
    var expose = function(destination, source) {
      var properties;
      if (arguments.length > 2) {
        properties = Array.prototype.slice.call(arguments, 2);
      } else {
        properties = source;
      }

      properties.forEach(function(p) {
        if (typeof source[p] === 'function') {
          destination[p] = function() {
            return source[p].apply(source, arguments);
          };
        } else {
          destination[p] = source[p];
        }
      });
    };

    /**
     Extend an object with the properties of one or more other objects

     @method extend
     @for Orbit
     @param {Object} destination The object to merge into
     @param {Object} source One or more source objects
     */
    var extend = function(destination) {
      var sources = Array.prototype.slice.call(arguments, 1);
      sources.forEach(function(source) {
        for (var p in source) {
          if (source.hasOwnProperty(p)) {
            destination[p] = source[p];
          }
        }
      });
    };

    /**
     Checks whether an object is an instance of an `Array`

     @method isArray
     @for Orbit
     @param {Object} obj
     @returns {boolean}
     */
    var isArray = function(obj) {
      return Object.prototype.toString.call(obj) === '[object Array]';
    };

    /**
     Checks whether an object is null or undefined

     @method isArray
     @for Orbit
     @param {Object} obj
     @returns {boolean}
     */
    var isNone = function(obj) {
      return obj === undefined || obj === null;
    };

    __exports__.clone = clone;
    __exports__.eq = eq;
    __exports__.expose = expose;
    __exports__.extend = extend;
    __exports__.isArray = isArray;
    __exports__.isNone = isNone;
  });
define("orbit/lib/strings",
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     Uppercase the first letter of a string. The remainder of the string won't
     be affected.

     @method capitalize
     @for Orbit
     @param {String} str
     @returns {String} capitalized string
     */
    var capitalize = function(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    __exports__.capitalize = capitalize;
  });
define("orbit/lib/stubs",
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     Empty method that does nothing.

     Use as a placeholder for non-required static methods.

     @method noop
     @for Orbit
     */
    var noop = function() {};

    /**
     Empty method that should be overridden. Otherwise, it will throw an Error.

     Use as a placeholder for required static methods.

     @method required
     @for Orbit
     */
    var required = function() { throw new Error("Missing implementation"); };

    __exports__.noop = noop;
    __exports__.required = required;
  });
define("orbit/main",
  [],
  function() {
    "use strict";
    /**
     Contains core methods and classes for Orbit.js

     @module orbit
     @main orbit
     */

    // Prototype extensions
    if (!Array.prototype.forEach) {
      Array.prototype.forEach = function (fn, scope) {
        var i, len;
        for (i = 0, len = this.length; i < len; ++i) {
          if (i in this) {
            fn.call(scope, this[i], i, this);
          }
        }
      };
    }

    /**
     Namespace for core Orbit methods and classes.

     @class Orbit
     @static
     */
    var Orbit = {};


    return Orbit;
  });
define("orbit/notifier",
  [],
  function() {
    "use strict";
    /**
     The `Notifier` class can emit messages to an array of subscribed listeners.
     Here's a simple example:

     ```javascript
     var notifier = new Orbit.Notifier();
     notifier.addListener(function(message) {
       console.log("I heard " + message);
     });
     notifier.addListener(function(message) {
       console.log("I also heard " + message);
     });

     notifier.emit('hello'); // logs "I heard hello" and "I also heard hello"
     ```

     Notifiers can also poll listeners with an event and return their responses:

     ```javascript
     var dailyQuestion = new Orbit.Notifier();
     dailyQuestion.addListener(function(question) {
       if (question === 'favorite food?') return 'beer';
     });
     dailyQuestion.addListener(function(question) {
       if (question === 'favorite food?') return 'wasabi almonds';
     });
     dailyQuestion.addListener(function(question) {
       // this listener doesn't return anything, and therefore won't participate
       // in the poll
     });

     dailyQuestion.poll('favorite food?'); // returns ['beer', 'wasabi almonds']
     ```

     Calls to `emit` and `poll` will send along all of their arguments.

     @class Notifier
     @namespace Orbit
     @constructor
     */
    var Notifier = function() {
      this.init.apply(this, arguments);
    };

    Notifier.prototype = {
      init: function() {
        this.listeners = [];
      },

      /**
       Add a callback as a listener, which will be triggered when sending
       notifications.

       @method addListener
       @param {Function} callback Function to call as a notification
       @param {Object} binding Context in which to call `callback`
       */
      addListener: function(callback, binding) {
        binding = binding || this;
        this.listeners.push([callback, binding]);
      },

      /**
       Remove a listener so that it will no longer receive notifications.

       @method removeListener
       @param {Function} callback Function registered as a callback
       @param {Object} binding Context in which `callback` was registered
       */
      removeListener: function(callback, binding) {
        var listeners = this.listeners,
            listener;

        binding = binding || this;
        for (var i = 0, len = listeners.length; i < len; i++) {
          listener = listeners[i];
          if (listener && listener[0] === callback && listener[1] === binding) {
            listeners.splice(i, 1);
            return;
          }
        }
      },

      /**
       Notify registered listeners.

       Any responses from listeners will be ignored.

       @method emit
       @param {*} Any number of parameters to be sent to listeners
       */
      emit: function() {
        var args = arguments;
        this.listeners.slice(0).forEach(function(listener) {
          listener[0].apply(listener[1], args);
        });
      },

      /**
       Poll registered listeners.

       Any responses from listeners will be returned in an array.

       @method poll
       @param {*} Any number of parameters to be sent to listeners
       @returns {Array} Array of responses
       */
      poll: function() {
        var args = arguments,
            allResponses = [],
            response;

        this.listeners.slice(0).forEach(function(listener) {
          response = listener[0].apply(listener[1], args);
          if (response !== undefined) { allResponses.push(response); }
        });

        return allResponses;
      }
    };

    return Notifier;
  });
define("orbit/request_connector",
  ["orbit/lib/assert","orbit/lib/config","orbit/lib/strings","orbit/requestable"],
  function(__dependency1__, __dependency2__, __dependency3__, Requestable) {
    "use strict";
    var assert = __dependency1__.assert;
    var arrayToOptions = __dependency2__.arrayToOptions;
    var capitalize = __dependency3__.capitalize;

    /**
     A `RequestConnector` observes requests made to a primary source and allows a
     secondary source to either "assist" or "rescue" those requests.

     A `RequestConnector` can operate in one of two modes:

     - In the default `"rescue"` mode, the secondary source will only be called upon
     to fulfill a request if the primary source fails to do so.

     - In `"assist"` mode, the secondary source will be called upon to fulfill a
     request before the primary source. Only if the secondary source fails to
     fulfill the request will the primary source be called upon to do so.

     Unlike a `TransformConnector`, a `RequestConnector` always blocks
     asynchronous requests before proceeding. In other words, any promises that
     are returned from requests will be settled (either succeeding or failing)
     before the connector proceeds.

     @class RequestConnector
     @namespace Orbit
     @param {Object}  primarySource
     @param {Object}  secondarySource
     @param {Object}  [options]
     @param {String}  [options.mode="rescue"] Mode of operation: `"rescue"` or `"assist"`
     @param {Boolean} [options.active=true] Is the connector is actively observing the `primarySource`?
     @constructor
     */
    var RequestConnector = function(primarySource, secondarySource, options) {
      var _this = this;

      this.primarySource = primarySource;
      this.secondarySource = secondarySource;

      options = options || {};

      this.actions = options.actions || Requestable.defaultActions;
      if (options.types) this.types = arrayToOptions(options.types);

      this.mode = options.mode !== undefined ? options.mode : 'rescue';
      assert("`mode` must be 'assist' or 'rescue'", this.mode === 'assist' ||
                                                    this.mode === 'rescue');

      var active = options.active !== undefined ? options.active : true;
      if (active) this.activate();
    };

    RequestConnector.prototype = {
      constructor: RequestConnector,

      activate: function() {
        var _this = this,
            handler;

        if (this._active) return;

        this.handlers = {};

        this.actions.forEach(function(action) {
          if (_this.types) {
            handler = function(type) {
              if (_this.types[type]) {
                return _this.secondarySource[action].apply(_this.secondarySource, arguments);
              }
            };
          } else {
            handler = _this.secondarySource[action];
          }

          _this.primarySource.on(_this.mode + capitalize(action),
            handler,
            _this.secondarySource
          );

          _this.handlers[action] = handler;
        });

        this._active = true;
      },

      deactivate: function() {
        var _this = this;

        this.actions.forEach(function(action) {
          this.primarySource.off(_this.mode + capitalize(action),
            _this.handlers[action],
            _this.secondarySource
          );
        });

        this._active = false;
      },

      isActive: function() {
        return this._active;
      }
    };

    return RequestConnector;
  });
define("orbit/requestable",
  ["orbit/lib/assert","orbit/lib/objects","orbit/lib/strings","orbit/evented"],
  function(__dependency1__, __dependency2__, __dependency3__, Evented) {
    "use strict";
    var assert = __dependency1__.assert;
    var isArray = __dependency2__.isArray;
    var capitalize = __dependency3__.capitalize;

    var Requestable = {
      defaultActions: ['find'],

      extend: function(object, actions) {
        if (object._requestable === undefined) {
          object._requestable = true;
          Evented.extend(object);
          this.defineAction(object, actions || this.defaultActions);
        }
        return object;
      },

      defineAction: function(object, action) {
        if (isArray(action)) {
          action.forEach(function(name) {
            this.defineAction(object, name);
          }, this);
        } else {
          object[action] = function() {
            assert('_' + action + ' must be defined', object['_' + action]);

            var args = Array.prototype.slice.call(arguments, 0),
                Action = capitalize(action);

            return object.resolve.apply(object, ['assist' + Action].concat(args)).then(
              undefined,
              function() {
                return object['_' + action].apply(object, args);
              }
            ).then(
              undefined,
              function(error) {
                return object.resolve.apply(object, ['rescue' + Action].concat(args)).then(
                  undefined,
                  function() {
                    throw error;
                  }
                );
              }
            ).then(
              function(result) {
                return object.settle.apply(object, ['did' + Action].concat(args).concat(result)).then(
                  function() {
                    return result;
                  }
                );
              },
              function(error) {
                return object.settle.apply(object, ['didNot' + Action].concat(args).concat(error)).then(
                  function() {
                    throw error;
                  }
                );
              }
            );
          };
        }
      }
    };

    return Requestable;
  });
define("orbit/transaction",
  [],
  function() {
    "use strict";
    var Transaction = function() {
      this.init.apply(this, arguments);
    };

    Transaction.prototype = {
      constructor: Transaction,

      init: function(source, options) {
        this.source = source;

        options = options || {};
        var active = options.active !== undefined ? options.active : true;
        if (active) this.begin();
      },

      begin: function() {
        this.ops = [];
        this.inverseOps = [];
        this._activate();
      },

      commit: function() {
        this._deactivate();
      },

      rollback: function() {
        this._deactivate();
        return this.source.transform(this.inverseOps);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Internals
      /////////////////////////////////////////////////////////////////////////////

      _activate: function() {
        this.source.on('didTransform', this._processTransform, this);
        this.active = true;
      },

      _deactivate: function() {
        this.source.off('didTransform', this._processTransform, this);
        this.active = false;
      },

      _processTransform: function(op, inverseOps) {
        this.ops.push(op);
        this.inverseOps.push.apply(this.inverseOps, inverseOps);
      }
    };

    return Transaction;
  });
define("orbit/transform_connector",
  ["orbit/lib/objects","orbit/lib/diffs","orbit/lib/eq","orbit/lib/config","orbit/action_queue"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, ActionQueue) {
    "use strict";
    var clone = __dependency1__.clone;
    var diffs = __dependency2__.diffs;
    var eq = __dependency3__.eq;
    var arrayToOptions = __dependency4__.arrayToOptions;

    /**
     A `TransformConnector` observes a source's transforms and applies them to a
     target.

     Each connector is "one way", so bi-directional synchronization between sources
     requires the creation of two connectors.

     A `TransformConnector` can operate in one of two modes:

     - In the default "blocking" mode, a connector will return a promise to the
     `didTransform` event, which will prevent the original transform from resolving
     until the promise itself has resolved.

     - In "non-blocking" mode, transforms do not block the resolution of the original
     transform - asynchronous actions are performed afterward.

     If the target of a connector is busy processing transformations, then the
     connector will queue operations until the target is free. This ensures that the
     target's state is as up to date as possible before transformations proceed.

     The connector's `transform` method actually applies transforms to its target.
     This method attempts to retrieve the current value at the path of the
     transformation and resolves any conflicts with the connector's
     `resolveConflicts` method. By default, a simple differential is applied to the
     target, although both `transform` and `resolveConflicts` can be overridden to
     apply an alternative differencing algorithm.

     @class TransformConnector
     @namespace Orbit
     @param {Object}  source
     @param {Object}  target
     @param {Object}  [options]
     @param {String}  [options.blocking=true] Does the connector wait for promises to be settled?
     @param {Boolean} [options.active=true] Is the connector is actively observing the `source`?
     @constructor
     */
    var TransformConnector = function(source, target, options) {
      this.source = source;
      this.target = target;
      this.transformQueue = new ActionQueue(this.transform, this, {autoProcess: false});

      options = options || {};
    // TODO - allow filtering of transforms
    //  if (options.actions) this.actions = arrayToOptions(options.actions);
    //  if (options.types) this.types = arrayToOptions(options.types);
      this.blocking = options.blocking !== undefined ? options.blocking : true;
      var active = options.active !== undefined ? options.active : true;

      if (active) this.activate();
    };

    TransformConnector.prototype = {
      constructor: TransformConnector,

      activate: function() {
        var _this = this;

        if (this._active) return;

        this.source.on('didTransform',  this._processTransform,  this);
        this.target.transformQueue.on('didComplete', this.transformQueue.process, this.transformQueue);

        this._active = true;
      },

      deactivate: function() {
        this.source.off('didTransform',  this._processTransform,  this);
        this.target.transformQueue.off('didComplete', this.transformQueue.process, this.transformQueue);

        this._active = false;
      },

      isActive: function() {
        return this._active;
      },

      transform: function(operation) {
        //TODO-log  console.log('****', ' transform from ', this.source.id, ' to ', this.target.id, operation);

        if (this.target.retrieve) {
          var currentValue = this.target.retrieve(operation.path);

          if (currentValue) {
            if (operation.op === 'add' || operation.op === 'replace') {
              if (eq(currentValue, operation.value)) {
                //TODO-log  console.log('==', ' transform from ', this.source.id, ' to ', this.target.id, operation);
                return;
              } else {
                return this.resolveConflicts(operation.path, currentValue, operation.value);
              }
            }
          } else if (operation.op === 'remove') {
            return;
          }
        }

        return this.target.transform(operation);
      },

      resolveConflicts: function(path, currentValue, updatedValue) {
        var ops = diffs(currentValue, updatedValue, {basePath: path});

        //TODO-log  console.log(this.target.id, 'resolveConflicts', path, currentValue, updatedValue, ops);

        return this.target.transform(ops);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Internals
      /////////////////////////////////////////////////////////////////////////////

      _processTransform: function(operation) {
    // TODO - add filtering back in
    //    if (this.actions && !this.actions[action]) return;
    //    if (this.types && !this.types[type]) return;

    //    console.log(this.target.id, 'processTransform', operation);
        if (this.blocking) {
          return this._applyOrQueueTransform(operation);

        } else {
          this._applyOrQueueTransform(operation);
        }
      },

      _applyOrQueueTransform: function(operation) {
        // If the target's transformQueue is processing, then we should queue up the
        // transform on the connector instead of on the target.
        // This ensures that comparisons are made against the target's most up to
        // date state. Note that this connector's queue processing is triggered
        // by the `didComplete` event for the target's queue.
        if (this.target.transformQueue.processing) {
          return this.transformQueue.push(operation);
        }

        return this.transform(operation);
      }
    };

    return TransformConnector;
  });
define("orbit/transformable",
  ["orbit/lib/assert","orbit/lib/objects","orbit/main","orbit/evented","orbit/action_queue"],
  function(__dependency1__, __dependency2__, Orbit, Evented, ActionQueue) {
    "use strict";
    var assert = __dependency1__.assert;
    var isArray = __dependency2__.isArray;

    var normalizeOperation = function(op) {
      if (typeof op.path === 'string') op.path = op.path.split('/');
    };

    var settleTransformEvents = function(ops) {
      var _this = this;

      return new Orbit.Promise(function(resolve) {
        var settleEach = function() {
          if (ops.length === 0) {
            resolve();

          } else {
            var op = ops.shift();

    //TODO-log        console.log(_this.id, ops.length + 1, 'didTransform', op[0], op[1]);

            var response = _this.settle.call(_this, 'didTransform', op[0], op[1]);

            if (response) {
              return response.then(
                function(success) {
                  settleEach();
                },
                function(error) {
                  settleEach();
                }
              );
            } else {
              settleEach();
            }
          }
        };

        settleEach();
      });
    };

    var transformOne = function(operation) {
      var _this = this;

      normalizeOperation(operation);

      return _this.transformQueue.push(operation).then(
        function(result) {
          if (_this._completedTransforms.length > 0) {
            return settleTransformEvents.call(_this, _this._completedTransforms).then(
              function() {
                return result;
              }
            );
          } else {
            return result;
          }
        }
      );
    };

    var transformMany = function(operations) {
      var _this = this,
          inverses = [],
          ret;

      operations.forEach(function(operation) {

        normalizeOperation(operation);

        ret = _this.transformQueue.push(operation).then(
          function(inverse) {
            if (_this._completedTransforms.length > 0) {
              return settleTransformEvents.call(_this, _this._completedTransforms).then(
                function() {
                  inverses = inverses.concat(inverse);
                }
              );
            } else {
              inverses = inverses.concat(inverse);
            }
          }
        );
      });

      return ret.then( function() { return inverses; } );
    };

    var Transformable = {
      extend: function(object, actions) {
        if (object._transformable === undefined) {
          object._transformable = true;
          object.transformQueue = new ActionQueue(object._transform, object);
          object._completedTransforms = [];

          Evented.extend(object);

          object.didTransform = function(operation, inverse) {
            object._completedTransforms.push([operation, inverse]);
          };

          object.settleTransforms = function() {
            return settleTransformEvents.call(object, object._completedTransforms);
          };

          object.transform = function(operation) {
            assert('_transform must be defined', object._transform);

            if (isArray(operation)) {
              return transformMany.call(object, operation);
            } else {
              return transformOne.call(object, operation);
            }
          };
        }
        return object;
      }
    };

    return Transformable;
  });