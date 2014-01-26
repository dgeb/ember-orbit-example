define("orbit", 
  ["./orbit/main","./orbit/action_queue","./orbit/cache","./orbit/document","./orbit/evented","./orbit/notifier","./orbit/requestable","./orbit/transaction","./orbit/transformable","./orbit/connectors/request_connector","./orbit/connectors/transform_connector","./orbit/lib/assert","./orbit/lib/config","./orbit/lib/diffs","./orbit/lib/eq","./orbit/lib/exceptions","./orbit/lib/objects","./orbit/lib/strings","./orbit/lib/stubs","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __dependency8__, __dependency9__, __dependency10__, __dependency11__, __dependency12__, __dependency13__, __dependency14__, __dependency15__, __dependency16__, __dependency17__, __dependency18__, __dependency19__, __exports__) {
    "use strict";
    var Orbit = __dependency1__["default"];
    var ActionQueue = __dependency2__["default"];
    var Cache = __dependency3__["default"];
    var Document = __dependency4__["default"];
    var Evented = __dependency5__["default"];
    var Notifier = __dependency6__["default"];
    var Requestable = __dependency7__["default"];
    var Transaction = __dependency8__["default"];
    var Transformable = __dependency9__["default"];
    var RequestConnector = __dependency10__["default"];
    var TransformConnector = __dependency11__["default"];
    var assert = __dependency12__.assert;
    var arrayToOptions = __dependency13__.arrayToOptions;
    var diffs = __dependency14__.diffs;
    var eq = __dependency15__.eq;
    var PathNotFoundException = __dependency16__.PathNotFoundException;
    var clone = __dependency17__.clone;
    var expose = __dependency17__.expose;
    var extend = __dependency17__.extend;
    var capitalize = __dependency18__.capitalize;
    var noop = __dependency19__.noop;
    var required = __dependency19__.required;

    Orbit.ActionQueue = ActionQueue;
    Orbit.Cache = Cache;
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

    __exports__["default"] = Orbit;
  });
define("orbit/action_queue", 
  ["orbit/main","orbit/evented","orbit/lib/assert","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var Orbit = __dependency1__["default"];
    var Evented = __dependency2__["default"];
    var assert = __dependency3__.assert;

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
      }
    };

    __exports__["default"] = ActionQueue;
  });
define("orbit/cache", 
  ["orbit/document","orbit/lib/objects","exports"],
  function(__dependency1__, __dependency2__, __exports__) {
    "use strict";
    var Document = __dependency1__["default"];
    var expose = __dependency2__.expose;

    var Cache = function() {
      this.init.apply(this, arguments);
    };

    Cache.prototype = {
      constructor: Cache,

      init: function(schema) {
        this._doc = new Document(null, {arrayBasedPaths: true});

        // Expose methods from the Document interface
        expose(this, this._doc, 'reset', 'transform');

        this.schema = schema;
        for (var model in schema.models) {
          if (schema.models.hasOwnProperty(model)) {
            this._doc.add([model], {});
          }
        }
      },

      // TODO - move to schema
      initRecord: function(type, data) {
        if (data[this.schema.idField] !== undefined) return;

        var modelSchema = this.schema.models[type],
            attributes = modelSchema.attributes,
            links = modelSchema.links;

        // init id
        data[this.schema.idField] = this.generateId();

        // init default values
        if (attributes) {
          for (var attribute in attributes) {
            if (data[attribute] === undefined && attributes[attribute].defaultValue) {
              if (typeof attributes[attribute].defaultValue === 'function') {
                data[attribute] = attributes[attribute].defaultValue.call(data);
              } else {
                data[attribute] = attributes[attribute].defaultValue;
              }
            }
          }
        }

        // init links
        if (links) {
          data.links = {};
          for (var link in links) {
            if (data.links[link] === undefined && links[link].type === 'hasMany') {
              data.links[link] = {};
            }
          }
        }
      },

      // TODO - move to schema
      generateId: function() {
        if (this._newId) {
          this._newId++;
        } else {
          this._newId = 1;
        }
        return new Date().getTime() + '.' + this._newId;
      },

      length: function(path) {
        return Object.keys(this.retrieve(path)).length;
      },

      retrieve: function(path) {
        try {
          return this._doc.retrieve(path);
        } catch(e) {
          return null;
        }
      }
    };

    __exports__["default"] = Cache;
  });
define("orbit/connectors/request_connector", 
  ["orbit/requestable","orbit/lib/assert","orbit/lib/config","orbit/lib/strings","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var Requestable = __dependency1__["default"];
    var assert = __dependency2__.assert;
    var arrayToOptions = __dependency3__.arrayToOptions;
    var capitalize = __dependency4__.capitalize;

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

    __exports__["default"] = RequestConnector;
  });
define("orbit/connectors/transform_connector", 
  ["orbit/action_queue","orbit/lib/objects","orbit/lib/diffs","orbit/lib/eq","orbit/lib/config","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var ActionQueue = __dependency1__["default"];
    var clone = __dependency2__.clone;
    var diffs = __dependency3__.diffs;
    var eq = __dependency4__.eq;
    var arrayToOptions = __dependency5__.arrayToOptions;

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

    __exports__["default"] = TransformConnector;
  });
define("orbit/document", 
  ["orbit/lib/objects","orbit/lib/diffs","orbit/lib/eq","orbit/lib/exceptions","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var clone = __dependency1__.clone;
    var diffs = __dependency2__.diffs;
    var eq = __dependency3__.eq;
    var PathNotFoundException = __dependency4__.PathNotFoundException;

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

      reset: function(data) {
        this._data = data || {};
      },

      retrieve: function(path) {
        return this._retrieve(this.deserializePath(path));
      },

      add: function(path, value, invert) {
        return this._add(this.deserializePath(path), value, invert);
      },

      remove: function(path, invert) {
        return this._remove(this.deserializePath(path), invert);
      },

      replace: function(path, value, invert) {
        return this._replace(this.deserializePath(path), value, invert);
      },

      move: function(fromPath, toPath, invert) {
        return this._move(this.deserializePath(fromPath), this.deserializePath(toPath), invert);
      },

      copy: function(fromPath, toPath, invert) {
        return this._copy(this.deserializePath(fromPath), this.deserializePath(toPath), invert);
      },

      test: function(path, value) {
        return eq(this._retrieve(this.deserializePath(path)), value);
      },

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
            if (Object.prototype.toString.call(ptr) === '[object Array]') {
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
            if (Object.prototype.toString.call(grandparent) === '[object Array]') {
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
            if (Object.prototype.toString.call(grandparent) === '[object Array]') {
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
            if (Object.prototype.toString.call(grandparent) === '[object Array]') {
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

    __exports__["default"] = Document;
  });
define("orbit/evented", 
  ["orbit/main","orbit/notifier","orbit/lib/assert","orbit/lib/objects","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var Orbit = __dependency1__["default"];
    var Notifier = __dependency2__["default"];
    var assert = __dependency3__.assert;
    var extend = __dependency4__.extend;

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

    var Evented = {
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

    __exports__["default"] = Evented;
  });
define("orbit/lib/assert", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     * Throw an exception if `test` is not truthy.
     *
     * @mathod assert
     * @param desc Description of the error thrown
     * @param test
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
     * Converts an array of values to an object with those values as properties
     * having a value of `true`.
     *
     * This is useful for converting an array of settings to a more efficiently
     * accessible settings object.
     *
     * For example:
     *
     * ``` javascript
     * Orbit.arrayToOptions(['a', 'b']); // returns {a: true, b: true}
     * ```
     *
     * @method arrayToOptions
     * @param arr
     * @returns {Object}
     */
    var arrayToOptions = function(arr) {
      var options = {};
      if (arr) {
        for (var i in arr) {
          if (arr.hasOwnProperty(i)) options[arr[i]] = true;
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
    var arrayToOptions = __dependency3__.arrayToOptions;

    var diffs = function(a, b, options) {
      if (a === b) {
        return undefined;

      } else {
        options = options || {};

        var ignore = arrayToOptions(options.ignore),
            basePath = options.basePath || '';

        if (Object.prototype.toString.call(basePath) === '[object Array]') {
          basePath = basePath.join('/');
        }

        var type = Object.prototype.toString.call(a);
        if (type === Object.prototype.toString.call(b)) {
          if (typeof a === 'object') {
            var i,
                d;

            if (type === '[object Array]') {
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
     * Expose properties and methods from one object on another.
     *
     * Methods will be called on `source` and will maintain `source` as the
     * context.
     *
     * @method expose
     * @param destination
     * @param source
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
     * Extend an object with the properties of one or more other objects
     *
     * @method extend
     * @param destination The object to merge into
     * @param source One or more source objects
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

    __exports__.clone = clone;
    __exports__.expose = expose;
    __exports__.extend = extend;
  });
define("orbit/lib/strings", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     * Uppercase the first letter of a string. The remainder of the string won't
     * be affected.
     *
     * @method capitalize
     * @param {String} str
     * @returns {String}
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
     * Empty method that does nothing.
     *
     * Use as a placeholder for non-required static methods.
     *
     * @method noop
     */
    var noop = function() {};

    /**
     * Empty method that should be overridden. Otherwise, it will throw an Error.
     *
     * Use as a placeholder for required static methods.
     *
     * @method required
     */
    var required = function() { throw new Error("Missing implementation"); };

    __exports__.noop = noop;
    __exports__.required = required;
  });
define("orbit/main", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     * Orbit
     *
     * @module orbit
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
     * Namespace for core Orbit methods and classes.
     *
     * @class Orbit
     * @static
     */
    var Orbit = {};

    __exports__["default"] = Orbit;
  });
define("orbit/notifier", 
  ["exports"],
  function(__exports__) {
    "use strict";
    var Notifier = function() {
      this.init.apply(this, arguments);
    };

    Notifier.prototype = {
      init: function() {
        this.listeners = [];
      },

      addListener: function(callback, binding) {
        binding = binding || this;
        this.listeners.push([callback, binding]);
      },

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

      emit: function() {
        var listeners = this.listeners,
            listener;

        for (var i = 0, len = listeners.length; i < len; i++) {
          listener = listeners[i];
          if (listener) {
            listener[0].apply(listener[1], arguments);
          }
        }
      },

      poll: function() {
        var listeners = this.listeners,
            listener,
            allResponses = [],
            response;

        for (var i = 0, len = listeners.length; i < len; i++) {
          listener = listeners[i];
          if (listener) {
            response = listener[0].apply(listener[1], arguments);
            if (response !== undefined) { allResponses.push(response); }
          }
        }

        return allResponses;
      }
    };

    __exports__["default"] = Notifier;
  });
define("orbit/requestable", 
  ["orbit/evented","orbit/lib/assert","orbit/lib/strings","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var Evented = __dependency1__["default"];
    var assert = __dependency2__.assert;
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
        if (Object.prototype.toString.call(action) === "[object Array]") {
          action.forEach(function(name) {
            this.defineAction(object, name);
          }, this);
        } else {
          object[action] = function() {
            assert('_' + action + ' must be defined', object['_' + action]);

            var args = Array.prototype.slice.call(arguments, 0),
                Action = capitalize(action);

            return object.resolve.apply(object, ['assist' + Action].concat(args)).then(
              null,
              function() {
                return object['_' + action].apply(object, args);
              }
            ).then(
              null,
              function(error) {
                return object.resolve.apply(object, ['rescue' + Action].concat(args)).then(
                  null,
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

    __exports__["default"] = Requestable;
  });
define("orbit/transaction", 
  ["exports"],
  function(__exports__) {
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

    __exports__["default"] = Transaction;
  });
define("orbit/transformable", 
  ["orbit/main","orbit/evented","orbit/action_queue","orbit/lib/assert","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __exports__) {
    "use strict";
    var Orbit = __dependency1__["default"];
    var Evented = __dependency2__["default"];
    var ActionQueue = __dependency3__["default"];
    var assert = __dependency4__.assert;

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

          object.transform = function(operation) {
            assert('_transform must be defined', object._transform);

            if (Object.prototype.toString.call(operation) === '[object Array]') {
              return transformMany.call(object, operation);
            } else {
              return transformOne.call(object, operation);
            }
          };
        }
        return object;
      }
    };

    __exports__["default"] = Transformable;
  });