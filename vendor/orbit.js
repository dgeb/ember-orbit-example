define("orbit",
  ["orbit/core","orbit/lib/eq","orbit/lib/clone","orbit/lib/diffs","orbit/cache","orbit/document","orbit/evented","orbit/notifier","orbit/requestable","orbit/transaction","orbit/transform_queue","orbit/transformable","orbit/sources/source","orbit/sources/local_storage_source","orbit/sources/memory_source","orbit/sources/jsonapi_source","orbit/connectors/request_connector","orbit/connectors/transform_connector"],
  function(Orbit, eq, clone, diffs, Cache, Document, Evented, Notifier, Requestable, Transaction, TransformQueue, Transformable, Source, LocalStorageSource, MemorySource, JSONAPISource, RequestConnector, TransformConnector) {
    "use strict";

    Orbit.eq = eq;
    Orbit.clone = clone;
    Orbit.diffs = diffs;
    Orbit.Cache = Cache;
    Orbit.Document = Document;
    Orbit.Evented = Evented;
    Orbit.Notifier = Notifier;
    Orbit.Requestable = Requestable;
    Orbit.Transaction = Transaction;
    Orbit.TransformQueue = TransformQueue;
    Orbit.Transformable = Transformable;
    Orbit.Source = Source;
    Orbit.LocalStorageSource = LocalStorageSource;
    Orbit.MemorySource = MemorySource;
    Orbit.JSONAPISource = JSONAPISource;
    Orbit.RequestConnector = RequestConnector;
    Orbit.TransformConnector = TransformConnector;

    return Orbit;
  });
define("orbit/cache",
  ["orbit/core","orbit/document"],
  function(Orbit, Document) {
    "use strict";

    var Cache = function() {
      this.init.apply(this, arguments);
    };

    Cache.prototype = {
      constructor: Cache,

      init: function(schema) {
        this._doc = new Document(null, {arrayBasedPaths: true});

        // Expose methods from the Document interface
        Orbit.expose(this, this._doc, 'reset');

        this.schema = schema;
        this._doc.add(['deleted'], {});
        for (var model in schema.models) {
          if (schema.models.hasOwnProperty(model)) {
            this._doc.add([model], {});
            this._doc.add(['deleted', model], {});
          }
        }
      },

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

      generateId: function() {
        return Orbit.generateId();
      },

      isDeleted: function(path) {
        return this.retrieve(['deleted'].concat(path));
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
      },

      transform: function(operation, invert) {
        var inverse = this._doc.transform(operation, invert);

        // Track deleted records
        if (operation.op === 'remove' && operation.path.length === 2) {
          this._doc.transform({op: 'add',
                               path: ['deleted'].concat(operation.path),
                               value: true});
        }

        return inverse;
      }
    };

    return Cache;
  });
define("orbit/connectors/request_connector",
  ["orbit/core","orbit/requestable"],
  function(Orbit, Requestable) {
    "use strict";

    var RequestConnector = function(primarySource, secondarySource, options) {
      var _this = this;

      this.primarySource = primarySource;
      this.secondarySource = secondarySource;

      options = options || {};

      this.actions = options.actions || Requestable.defaultActions;
      if (options.types) this.types = Orbit.arrayToOptions(options.types);

      this.mode = options.mode !== undefined ? options.mode : 'rescue';
      Orbit.assert("`mode` must be 'assist' or 'rescue'", this.mode === 'assist' ||
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

          _this.primarySource.on(_this.mode + Orbit.capitalize(action),
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
          this.primarySource.off(_this.mode + Orbit.capitalize(action),
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
define("orbit/connectors/transform_connector",
  ["orbit/core","orbit/lib/clone","orbit/lib/diffs","orbit/lib/eq"],
  function(Orbit, clone, diffs, eq) {
    "use strict";

    var TransformConnector = function(source, target, options) {
      var _this = this;

      this.source = source;
      this.target = target;

      options = options || {};
    // TODO - allow filtering of transforms
    //  if (options.actions) this.actions = Orbit.arrayToOptions(options.actions);
    //  if (options.types) this.types = Orbit.arrayToOptions(options.types);
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

        this._active = true;
      },

      deactivate: function() {
        this.source.off('didTransform',  this._processTransform,  this);

        this._active = false;
      },

      isActive: function() {
        return this._active;
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
          return this._transformTarget(operation);

        } else {
          this._transformTarget(operation);
        }
      },

      _transformTarget: function(operation) {
    //TODO-log    console.log('****', ' transform from ', this.source.id, ' to ', this.target.id, operation);

        if (this.target.isDeleted && this.target.isDeleted(operation.path)) return;

        if (this.target.retrieve) {
          var currentValue = this.target.retrieve(operation.path);

          if (currentValue) {
            if (operation.op === 'add' || operation.op === 'replace') {
              if (eq(currentValue, operation.value)) {
    //TODO-log            console.log('==', ' transform from ', this.source.id, ' to ', this.target.id, operation);
                return;
              } else {
                return this._resolveConflicts(operation.path, currentValue, operation.value);
              }
            }
          } else if (operation.op === 'remove') {
            return;
          }
        }

        return this.target.transform(operation);
      },

      _resolveConflicts: function(path, currentValue, updatedValue) {
        var ops = diffs(currentValue, updatedValue, {basePath: path});

    //TODO-log    console.log(this.target.id, 'resolveConflicts', path, currentValue, updatedValue, ops);

        return this.target.transform(ops);
      }
    };

    return TransformConnector;
  });
define("orbit/core",
  ["orbit/lib/eq","orbit/lib/clone"],
  function(eq, clone) {
    "use strict";

    /**
     * Prototype extensions
     */
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
     * Orbit
     */
    var Orbit = {
      generateId: function() {
        if (this._newId) {
          this._newId++;
        } else {
          this._newId = 1;
        }
        return new Date().getTime() + '.' + this._newId;
      },

      assert: function(desc, test) {
        if (!test) throw new Error("Assertion failed: " + desc);
      },

      capitalize: function(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
      },

      expose: function(destination, source) {
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
      },

      extend: function(destination) {
        var sources = Array.prototype.slice.call(arguments, 1);
        sources.forEach(function(source) {
          for (var p in source) {
            destination[p] = source[p];
          }
        });
      },

      K: function() { return this; },

      arrayToOptions: function(arr) {
        var options = {};
        if (arr) {
          for (var i in arr) {
            if (arr.hasOwnProperty(i)) options[arr[i]] = true;
          }
        }
        return options;
      },

      promisifyException: function(e) {
        return new Orbit.Promise(function(resolve, reject) {
          reject(e);
        });
      }
    };

    Orbit.NotFoundException = function(type, record) {
      this.type = type;
      this.record = record;
    };
    Orbit.NotFoundException.prototype = {
      constructor: 'NotFoundException'
    };

    Orbit.AlreadyExistsException = function(type, record) {
      this.type = type;
      this.record = record;
    };
    Orbit.AlreadyExistsException.prototype = {
      constructor: 'AlreadyExistsException'
    };


    return Orbit;
  });
define("orbit/document",
  ["orbit/lib/clone","orbit/lib/diffs","orbit/lib/eq"],
  function(clone, diffs, eq) {
    "use strict";

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
        throw new Document.PathNotFoundException(this.serializePath(path));
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

    var PathNotFoundException = function(path) {
      this.path = path;
    };
    PathNotFoundException.prototype = {
      constructor: PathNotFoundException
    };
    Document.PathNotFoundException = PathNotFoundException;

    return Document;
  });
define("orbit/evented",
  ["orbit/core","orbit/notifier"],
  function(Orbit, Notifier) {
    "use strict";

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
        Orbit.assert('Evented requires Orbit.Promise be defined', Orbit.Promise);

        if (object._evented === undefined) {
          Orbit.extend(object, this.interface);
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

    return Evented;
  });
define("orbit/lib/clone",
  ["orbit/lib/eq"],
  function(eq) {
    "use strict";

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

    return clone;
  });
define("orbit/lib/diffs",
  ["orbit/lib/eq","orbit/lib/clone"],
  function(eq, clone) {
    "use strict";

    // TODO - extract
    var arrayToOptions = function(arr) {
      var options = {};
      if (arr) {
        for (var i in arr) {
          if (arr.hasOwnProperty(i)) options[arr[i]] = true;
        }
      }
      return options;
    };

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

    return diffs;
  });
define("orbit/lib/eq",
  [],
  function() {
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

    return eq;
  });
define("orbit/notifier",
  [],
  function() {
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

    return Notifier;
  });
define("orbit/requestable",
  ["orbit/core","orbit/evented"],
  function(Orbit, Evented) {
    "use strict";

    var Requestable = {
      defaultActions: ['find'],

      extend: function(object, actions) {
        if (object._requestable === undefined) {
          object._requestable = true;
          Evented.extend(object);
          this._defineAction(object, actions || this.defaultActions);
        }
        return object;
      },

      /////////////////////////////////////////////////////////////////////////////
      // Internals
      /////////////////////////////////////////////////////////////////////////////

      _defineAction: function(object, action) {
        if (Object.prototype.toString.call(action) === "[object Array]") {
          action.forEach(function(name) {
            this._defineAction(object, name);
          }, this);
        } else {
          object[action] = function() {
            Orbit.assert('_' + action + ' must be defined', object['_' + action]);

            var args = Array.prototype.slice.call(arguments, 0),
                Action = Orbit.capitalize(action);

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

    return Requestable;
  });
define("orbit/sources/jsonapi_source",
  ["orbit/core","orbit/sources/source","orbit/lib/clone"],
  function(Orbit, Source, clone) {
    "use strict";

    var JSONAPISource = function() {
      this.init.apply(this, arguments);
    };

    Orbit.extend(JSONAPISource.prototype, Source.prototype, {
      constructor: JSONAPISource,

      init: function(schema, options) {
        Orbit.assert('JSONAPISource requires Orbit.Promise be defined', Orbit.Promise);
        Orbit.assert('JSONAPISource requires Orbit.ajax be defined', Orbit.ajax);

        Source.prototype.init.apply(this, arguments);

        options = options || {};
        this.schema = schema;
        this.remoteIdField = options['remoteIdField'] || 'id';
        this.namespace = options['namespace'];
        this.headers = options['headers'];

        this._remoteToLocalIdMap = {};
        this._localToRemoteIdMap = {};
      },

      initRecord: function(type, record) {
        var id = record[this.schema.idField],
            remoteId = record[this.remoteIdField];

        if (remoteId && !id) {
          id = record[this.idField] = this._remoteToLocalId(remoteId);
        }

        if (!id) {
          this._cache.initRecord(type, record);
          id = record[this.schema.idField];
        }

        this._updateRemoteIdMap(type, id, remoteId);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Transformable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _transform: function(operation) {
        var _this = this,
            path  = operation.path,
            data  = operation.value,
            type  = path[0],
            id    = path[1],
            remoteId,
            record;

        if (path.length > 2) {
          remoteId = this._localToRemoteId(type, id);
          if (!remoteId) throw new Orbit.NotFoundException(type, id);

          var baseURL = this._buildURL(type, remoteId);

          path = path.slice(2);

          if (path[0] === 'links') {
            var property = path[1];
            var linkDef = this._cache.schema.models[type].links[property];

            var linkedId;

            if (operation.op === 'remove') {
              if (path.length > 2) {
                linkedId = path.pop();
                path.push(this._localToRemoteId(linkDef.model, linkedId));
              }

            } else {
              if (path.length > 2) {
                linkedId = path.pop();
                path.push('-');
              } else {
                linkedId = data;
              }
              data = this._localToRemoteId(linkDef.model, linkedId);
            }
          }

          var remoteOp = {op: operation.op, path: baseURL + '/' + path.join('/')};
          if (data) remoteOp.value = data;

          return this._ajax(baseURL, 'PATCH', {data: remoteOp}).then(
            function() {
              _this._transformCache(operation);
            }
          );

        } else {
          if (operation.op === 'add') {
            if (id) {
              var recordInCache = _this.retrieve([type, id]);
              if (recordInCache) throw new Orbit.AlreadyExistsException(type, id);
            }

            return this._ajax(this._buildURL(type), 'POST', {data: this._serialize(type, data)}).then(
              function(raw) {
                record = _this._deserialize(type, raw);
                record[_this.schema.idField] = id;
                _this._addToCache(type, record);
              }
            );

          } else {
            remoteId = this._localToRemoteId(type, id);
            if (!remoteId) throw new Orbit.NotFoundException(type, id);

            if (operation.op === 'replace') {
              return this._ajax(this._buildURL(type, remoteId), 'PUT', {data: this._serialize(type, data)}).then(
                function(raw) {
                  record = _this._deserialize(type, raw);
                  record[_this.schema.idField] = id;
                  _this._addToCache(type, record);
                }
              );

            } else if (operation.op === 'remove') {
              return this._ajax(this._buildURL(type, remoteId), 'DELETE').then(function() {
                _this._transformCache(operation);
              });
            }
          }
        }
      },

      /////////////////////////////////////////////////////////////////////////////
      // Requestable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _find: function(type, id) {
        if (id && (typeof id === 'number' || typeof id === 'string')) {
          var remoteId = this._localToRemoteId(type, id);
          if (!remoteId) throw new Orbit.NotFoundException(type, id);
          return this._findOne(type, remoteId);

        } else if (id && (typeof id === 'object' && id[this.remoteIdField])) {
          return this._findOne(type, id[this.remoteIdField]);

        } else {
          return this._findQuery(type, id);
        }
      },

      /////////////////////////////////////////////////////////////////////////////
      // Internals
      /////////////////////////////////////////////////////////////////////////////

      _addToCache: function(type, record) {
        this.initRecord(type, record);
        this._transformCache({
          op: 'add',
          path: [type, record[this.schema.idField]],
          value: record
        });
      },

      _findOne: function(type, remoteId) {
        var _this = this;
        return this._ajax(this._buildURL(type, remoteId), 'GET').then(
          function(raw) {
            var record = _this._deserialize(type, raw);
            _this._addToCache(type, record);
            return record;
          }
        );
      },

      _findQuery: function(type, query) {
        var _this = this;

        return this._ajax(this._buildURL(type), 'GET', {data: query}).then(
          function(raw) {
            var eachRaw,
                record,
                records = [];

            raw.forEach(function(eachRaw) {
              record = _this._deserialize(type, eachRaw);
              _this._addToCache(type, record);
              records.push(record);
            });

            return records;
          }
        );
      },

      _localToRemoteId: function(type, id) {
        var dataForType = this._localToRemoteIdMap[type];
        if (dataForType) return dataForType[id];
      },

      _remoteToLocalId: function(type, remoteId) {
        var dataForType = this._remoteToLocalIdMap[type];
        if (dataForType) return dataForType[remoteId];
      },

      _transformCache: function(operation) {
        var pathToVerify,
            inverse;

        if (operation.op === 'add') {
          pathToVerify = operation.path.slice(0, operation.path.length - 1);
        } else {
          pathToVerify = operation.path;
        }

        if (!this.retrieve(pathToVerify)) {
          // TODO console.log('JSONAPISource does not have cached', pathToVerify, 'for operation', operation);
          inverse = [];

        } else {
          inverse = this._cache.transform(operation, true);
        }

        this.didTransform(operation, inverse);
      },

      _updateRemoteIdMap: function(type, id, remoteId) {
        if (id && remoteId) {
          var mapForType;

          mapForType = this._remoteToLocalIdMap[type];
          if (!mapForType) mapForType = this._remoteToLocalIdMap[type] = {};
          mapForType[remoteId] = id;

          mapForType = this._localToRemoteIdMap[type];
          if (!mapForType) mapForType = this._localToRemoteIdMap[type] = {};
          mapForType[id] = remoteId;
        }
      },

      _ajax: function(url, method, hash) {
        var _this = this;

        return new Orbit.Promise(function(resolve, reject) {
          hash = hash || {};
          hash.url = url;
          hash.type = method;
          hash.dataType = 'json';
          hash.context = _this;

    //TODO-log      console.log('ajax start', method);

          if (hash.data && method !== 'GET') {
            hash.contentType = 'application/json; charset=utf-8';
            hash.data = JSON.stringify(hash.data);
          }

          if (_this.headers !== undefined) {
            var headers = _this.headers;
            hash.beforeSend = function (xhr) {
              for (var key in headers) {
                if (headers.hasOwnProperty(key)) {
                  xhr.setRequestHeader(key, headers[key]);
                }
              }
            };
          }

          hash.success = function(json) {
    //TODO-log        console.log('ajax success', method, json);
            resolve(json);
          };

          hash.error = function(jqXHR, textStatus, errorThrown) {
            if (jqXHR) {
              jqXHR.then = null;
            }
    //TODO-log        console.log('ajax error', method, jqXHR);

            reject(jqXHR);
          };

          Orbit.ajax(hash);
        });
      },

      _buildURL: function(type, remoteId) {
        var host = this.host,
            namespace = this.namespace,
            url = [];

        if (host) { url.push(host); }
        if (namespace) { url.push(namespace); }
        url.push(this._pathForType(type));
        if (remoteId) { url.push(remoteId); }

        url = url.join('/');
        if (!host) { url = '/' + url; }

        return url;
      },

      _pathForType: function(type) {
        return this._pluralize(type);
      },

      _pluralize: function(name) {
        // TODO - allow for pluggable inflector
        return name + 's';
      },

      _serialize: function(type, data) {
        var serialized = clone(data);
        delete serialized[this.schema.idField];

        if (serialized.links) {
          var links = {};
          for (var i in serialized.links) {
            var link = serialized.links[i];
            if (typeof link === 'object') {
              links[i] = Object.keys(link);
            } else {
              links[i] = link;
            }
          }
          serialized.links = links;
        }

        return serialized;
      },

      _deserialize: function(type, data) {
        return data;
      }
    });

    return JSONAPISource;
  });
define("orbit/sources/local_storage_source",
  ["orbit/core","orbit/sources/memory_source"],
  function(Orbit, MemorySource) {
    "use strict";

    var supportsLocalStorage = function() {
      try {
        return 'localStorage' in window && window['localStorage'] !== null;
      } catch(e) {
        return false;
      }
    };

    var LocalStorageSource = function() {
      this.init.apply(this, arguments);
    };

    Orbit.extend(LocalStorageSource.prototype, MemorySource.prototype, {
      constructor: LocalStorageSource,

      init: function(schema, options) {
        Orbit.assert('Your browser does not support local storage!', supportsLocalStorage());

        MemorySource.prototype.init.apply(this, arguments);

        options = options || {};
        this.namespace = options['namespace'] || 'orbit'; // local storage key
        this._autosave = options['autosave'] !== undefined ? options['autosave'] : true;
        var autoload = options['autoload'] !== undefined ? options['autoload'] : true;

        this._isDirty = false;

        this.on('didTransform', function() {
          this._saveData();
        }, this);

        if (autoload) this.load();
      },

      load: function() {
        var storage = window.localStorage.getItem(this.namespace);
        if (storage) {
          this.reset(JSON.parse(storage));
        }
      },

      enableAutosave: function() {
        if (!this._autosave) {
          this._autosave = true;
          if (this._isDirty) this._saveData();
        }
      },

      disableAutosave: function() {
        if (this._autosave) {
          this._autosave = false;
        }
      },

      /////////////////////////////////////////////////////////////////////////////
      // Internals
      /////////////////////////////////////////////////////////////////////////////

      _saveData: function(forceSave) {
        if (!this._autosave && !forceSave) {
          this._isDirty = true;
          return;
        }
        window.localStorage.setItem(this.namespace, JSON.stringify(this.retrieve()));
        this._isDirty = false;
      }
    });

    return LocalStorageSource;
  });
define("orbit/sources/memory_source",
  ["orbit/core","orbit/sources/source"],
  function(Orbit, Source) {
    "use strict";

    var MemorySource = function() {
      this.init.apply(this, arguments);
    };

    Orbit.extend(MemorySource.prototype, Source.prototype, {
      constructor: MemorySource,

      init: function(schema, options) {
        Orbit.assert('MemorySource requires Orbit.Promise to be defined', Orbit.Promise);

        Source.prototype.init.apply(this, arguments);
      },

      initRecord: function(type, record) {
        this._cache.initRecord(type, record);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Transformable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _transform: function(operation) {
        var inverse = this._cache.transform(operation, true);
        this.didTransform(operation, inverse);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Requestable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _find: function(type, id) {
        var _this = this;

        return new Orbit.Promise(function(resolve, reject) {
          if (id === undefined || typeof id === 'object') {
            resolve(_this._filter.call(_this, type, id));
          } else {
            var record = _this.retrieve([type, id]);
            if (record && !record.deleted) {
              resolve(record);
            } else {
              reject(new Orbit.NotFoundException(type, id));
            }
          }
        });
      },

      /////////////////////////////////////////////////////////////////////////////
      // Internals
      /////////////////////////////////////////////////////////////////////////////

      _filter: function(type, query) {
        var all = [],
            dataForType,
            i,
            prop,
            match,
            record;

        dataForType = this.retrieve([type]);

        for (i in dataForType) {
          if (dataForType.hasOwnProperty(i)) {
            record = dataForType[i];
            if (query === undefined) {
              match = true;
            } else {
              match = false;
              for (prop in query) {
                if (record[prop] === query[prop]) {
                  match = true;
                } else {
                  match = false;
                  break;
                }
              }
            }
            if (match && !record.deleted) {
              all.push(record);
            }
          }
        }
        return all;
      }
    });

    return MemorySource;
  });
define("orbit/sources/source",
  ["orbit/core","orbit/cache","orbit/document","orbit/transformable","orbit/requestable"],
  function(Orbit, Cache, Document, Transformable, Requestable) {
    "use strict";

    var Source = function() {
      this.init.apply(this, arguments);
    };

    Source.prototype = {
      constructor: Source,

      init: function(schema, options) {
        Orbit.assert("Source's `schema` must be specified", schema);
        Orbit.assert("Source's `schema.idField` must be specified", schema.idField);

        this.schema = schema;

        options = options || {};

        // Create an internal cache and expose some elements of its interface
        this._cache = new Cache(schema);
        Orbit.expose(this, this._cache, 'isDeleted', 'length', 'reset', 'retrieve');

        Transformable.extend(this);
        Requestable.extend(this, ['find', 'add', 'update', 'patch', 'remove', 'link', 'unlink']);
      },

      initRecord: Orbit.K,

      /////////////////////////////////////////////////////////////////////////////
      // Transformable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _transform: Orbit.K,

      /////////////////////////////////////////////////////////////////////////////
      // Requestable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _find: Orbit.K,

      _add: function(type, data) {
        this.initRecord(type, data);

        var id = data[this.schema.idField],
            path = [type, id],
            _this = this;

        return this.transform({op: 'add', path: path, value: data}).then(function() {
          return _this.retrieve(path);
        });
      },

      _update: function(type, data) {
        this.initRecord(type, data);

        var id = data[this.schema.idField],
            path = [type, id],
            _this = this;

        return this.transform({op: 'replace', path: path, value: data}).then(function() {
          return _this.retrieve(path);
        });
      },

      _patch: function(type, id, property, value) {
        if (typeof id === 'object') {
          var record = id;
          this.initRecord(type, record);
          id = record[this.schema.idField];
        }

        return this.transform({
          op: 'replace',
          path: [type, id].concat(Document.prototype.deserializePath(property)),
          value: value
        });
      },

      _remove: function(type, id) {
        if (typeof id === 'object') {
          var record = id;
          this.initRecord(type, record);
          id = record[this.schema.idField];
        }

        return this.transform({op: 'remove', path: [type, id]});
      },

      _link: function(type, id, property, value) {
        var linkOp = function(linkDef, type, id, property, value) {
          var path = [type, id, 'links', property];
          if (linkDef.type === 'hasMany') {
            path.push(value);
            value = true;
          }
          return {
            op: 'add',
            path: path,
            value: value
          };
        };

        var linkDef = this.schema.models[type].links[property],
            ops,
            _this = this;

        // Normalize ids
        if (typeof id === 'object') {
          var record = id;
          this.initRecord(type, record);
          id = record[this.schema.idField];
        }
        if (typeof value === 'object') {
          var relatedRecord = value;
          this.initRecord(linkDef.model, relatedRecord);
          value = relatedRecord[this.schema.idField];
        }

        // Add link to primary resource
        ops = [linkOp(linkDef, type, id, property, value)];

        // Add inverse link if necessary
        if (linkDef.inverse) {
          var inverseLinkDef = this.schema.models[linkDef.model].links[linkDef.inverse];
          ops.push(linkOp(inverseLinkDef, linkDef.model, value, linkDef.inverse, id));
        }

        return this.transform(ops).then(function() {
          return _this.retrieve([type, id]);
        });
      },

      _unlink: function(type, id, property, value) {
        var unlinkOp = function(linkDef, type, id, property, value) {
          var path = [type, id, 'links', property];
          if (linkDef.type === 'hasMany') path.push(value);
          return {
            op: 'remove',
            path: path
          };
        };

        var linkDef = this.schema.models[type].links[property],
            ops,
            record,
            relatedRecord,
            _this = this;

        // Normalize ids
        if (typeof id === 'object') {
          record = id;
          this.initRecord(type, record);
          id = record[this.schema.idField];
        }
        if (typeof value === 'object') {
          relatedRecord = value;
          this.initRecord(linkDef.model, relatedRecord);
          value = relatedRecord[this.schema.idField];
        }

        // Remove link from primary resource
        ops = [unlinkOp(linkDef, type, id, property, value)];

        // Remove inverse link if necessary
        if (linkDef.inverse) {
          if (value === undefined) {
            if (record === undefined) {
              record = this.retrieve(type, id);
            }
            value = record.links[property];
          }

          var inverseLinkDef = this.schema.models[linkDef.model].links[linkDef.inverse];
          ops.push(unlinkOp(inverseLinkDef, linkDef.model, value, linkDef.inverse, id));
        }

        return this.transform(ops).then(function() {
          return _this.retrieve([type, id]);
        });
      }
    };

    return Source;
  });
define("orbit/transaction",
  ["orbit/core"],
  function(Orbit) {
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
define("orbit/transform_queue",
  ["orbit/core"],
  function(Orbit) {
    "use strict";

    var TransformQueue = function() {
      this.init.apply(this, arguments);
    };

    TransformQueue.prototype = {
      constructor: TransformQueue,

      init: function(target) {
        Orbit.assert('TransformQueue requires Orbit.Promise to be defined', Orbit.Promise);

        this.target = target;
        this._queue = [];
        this.processing = false;
        this.autoProcess = true;
      },

      push: function(operation) {
        var _this = this;

    //TODO-log    console.log('>>>> TransformQueue', _this.target.id, operation);

        var response = new Orbit.Promise(function(resolve) {
          var transform = {
            resolver: function() {
              var ret = _this.target._transform.call(_this.target, operation);
              if (ret) {
                return ret.then(
                  function() {
                    resolve();
                  }
                );
              } else {
                resolve();
              }
            },
            op: operation
          };

          _this._queue.push(transform);
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
    //TODO-log          console.log('---- TransformQueue', _this.target.id, 'EMPTY');

            } else {
              var transform = _this._queue.shift();

    //TODO-log          console.log('<<<< TransformQueue', _this.target.id, transform.operation);

              var ret = transform.resolver.call(_this);
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

    return TransformQueue;
  });
define("orbit/transformable",
  ["orbit/core","orbit/evented","orbit/transform_queue"],
  function(Orbit, Evented, TransformQueue) {
    "use strict";

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
          object.transformQueue = new TransformQueue(object);
          object._completedTransforms = [];

          Evented.extend(object);

          object.didTransform = function(operation, inverse) {
            object._completedTransforms.push([operation, inverse]);
          };

          object.transform = function(operation) {
            Orbit.assert('_transform must be defined', object._transform);

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

    return Transformable;
  });