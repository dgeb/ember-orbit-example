define("orbit_common",
  ["orbit_common/lib/exceptions","orbit_common/main","orbit_common/cache","orbit_common/id_map","orbit_common/schema","orbit_common/source","orbit_common/memory_source"],
  function(__dependency1__, OC, Cache, IdMap, Schema, Source, MemorySource) {
    "use strict";
    var OperationNotAllowed = __dependency1__.OperationNotAllowed;
    var RecordNotFoundException = __dependency1__.RecordNotFoundException;
    var LinkNotFoundException = __dependency1__.LinkNotFoundException;
    var RecordAlreadyExistsException = __dependency1__.RecordAlreadyExistsException;

    OC.Cache = Cache;
    OC.Schema = Schema;
    OC.Source = Source;
    OC.MemorySource = MemorySource;
    // exceptions
    OC.OperationNotAllowed = OperationNotAllowed;
    OC.RecordNotFoundException = RecordNotFoundException;
    OC.LinkNotFoundException = LinkNotFoundException;
    OC.RecordAlreadyExistsException = RecordAlreadyExistsException;


    return OC;
  });
define("orbit_common/cache",
  ["orbit/lib/objects","orbit_common/lib/exceptions","orbit/document","orbit/evented"],
  function(__dependency1__, __dependency2__, Document, Evented) {
    "use strict";
    var expose = __dependency1__.expose;
    var isArray = __dependency1__.isArray;
    var OperationNotAllowed = __dependency2__.OperationNotAllowed;

    /**
     `Cache` provides a thin wrapper over an internally maintained instance of a
     `Document`.

     `Cache` prepares records to be cached according to a specified schema. The
     schema also determines the paths at which records will be stored.

     Once cached, data can be accessed at a particular path with `retrieve`. The
     size of data at a path can be accessed with `length`.

     @class Cache
     @namespace OC
     @param {OC.Schema} schema
     @param {Object}  [options]
     @param {Boolean} [options.trackChanges=true] Should the `didTransform` event be triggered after calls to `transform`?
     @param {Boolean} [options.trackRevLinks=true] Should `__rev` be maintained for each record, indicating which other records reference them?
     @param {Boolean} [options.trackRevLinkChanges=false] Should the `didTransform` event be triggered after `__rev` is updated?
     @constructor
     */
    var Cache = function() {
      this.init.apply(this, arguments);
    };

    Cache.prototype = {
      constructor: Cache,

      init: function(schema, options) {
        options = options || {};
        this.trackChanges = options.trackChanges !== undefined ? options.trackChanges : true;
        this.trackRevLinks = options.trackRevLinks !== undefined ? options.trackRevLinks : true;
        this.trackRevLinkChanges = options.trackRevLinkChanges !== undefined ? options.trackRevLinkChanges : false;

        this._doc = new Document(null, {arrayBasedPaths: true});

        Evented.extend(this);

        this.schema = schema;
        for (var model in schema.models) {
          if (schema.models.hasOwnProperty(model)) {
            this._registerModel(model);
          }
        }

        // TODO - clean up listener
        this.schema.on('modelRegistered', this._registerModel, this);
      },

      _registerModel: function(model) {
        var modelRootPath = [model];
        if (!this.retrieve(modelRootPath)) {
          this._doc.add(modelRootPath, {});
        }
      },

      reset: function(data) {
        this._doc.reset(data);
        this.schema.registerAllIds(data);
      },

      /**
       Return the size of data at a particular path

       @method length
       @param path
       @returns {Number}
       */
      length: function(path) {
        var data = this.retrieve(path);
        if (data === null) {
          return null;
        } else if (isArray(data)) {
          return data.length;
        } else {
          return Object.keys(data).length;
        }
      },

      /**
       Return data at a particular path.

       Returns `null` if the path does not exist in the document.

       @method retrieve
       @param path
       @returns {Object}
       */
      retrieve: function(path) {
        try {
          return this._doc.retrieve(path);
        } catch(e) {
          return null;
        }
      },

      /**
       Transforms the document with an RFC 6902-compliant operation.

       Currently limited to `add`, `remove` and `replace` operations.

       Throws `PathNotFoundException` if the path does not exist in the document.

       @method transform
       @param {Object} operation
       @param {String} operation.op Must be "add", "remove", or "replace"
       @param {Array or String} operation.path Path to target location
       @param {Object} operation.value Value to set. Required for "add" and "replace"
       */
      transform: function(operation) {
        var op = operation.op,
            path = operation.path;

        path = this._doc.deserializePath(path);

        if (op !== 'add' && op !== 'remove' && op !== 'replace') {
          throw new OperationNotAllowed('Cache#transform requires an "add", "remove" or "replace" operation.');
        }

        if (path.length < 2) {
          throw new OperationNotAllowed('Cache#transform requires an operation with a path >= 2 segments.');
        }

        if (this.trackRevLinks && (op === 'remove' || op === 'replace')) {
          this._removeRevLinks(path);
        }

        this._transform(operation, this.trackChanges);

        if (this.trackRevLinks && (op === 'add' || op === 'replace')) {
          this._addRevLinks(path, operation.value);
        }
      },

      _transform: function(operation, track) {
    //    console.log('_transform', operation, track);
        if (track) {
          var inverse = this._doc.transform(operation, true);
          this.emit('didTransform', operation, inverse);

        } else {
          this._doc.transform(operation, false);
        }
      },

      _addRevLinks: function(path, value) {
    //    console.log('_addRevLinks', path, value);
        if (value) {
          var _this = this,
              type = path[0],
              id = path[1],
              linkSchema,
              linkValue;

          if (path.length === 2) {
            // when a whole record is added, add inverse links for every link
            if (value.__rel) {
              Object.keys(value.__rel).forEach(function(link) {
                linkSchema = _this.schema.models[type].links[link];
                linkValue = value.__rel[link];

                if (linkSchema.type === 'hasMany') {
                  Object.keys(linkValue).forEach(function(v) {
                    _this._addRevLink(linkSchema, type, id, link, v);
                  });

                } else {
                  _this._addRevLink(linkSchema, type, id, link, linkValue);
                }
              });
            }

          } else if (path.length > 3) {
            var link = path[3];

            linkSchema = _this.schema.models[type].links[link];

            if (path.length === 5) {
              linkValue = path[4];
            } else {
              linkValue = value;
            }

            this._addRevLink(linkSchema, type, id, link, linkValue);
          }
        }
      },

      _addRevLink: function(linkSchema, type, id, link, value) {
    //    console.log('_addRevLink', linkSchema, type, id, link, value);

        if (value && typeof value === 'string') {
          var linkPath = [type, id, '__rel', link];
          if (linkSchema.type === 'hasMany') {
            linkPath.push(value);
          }
          linkPath = '/' + linkPath.join('/');

          var refsPath = [linkSchema.model, value, '__rev'];
          var refs = this.retrieve(refsPath);
          if (!refs) {
            refs = {};
            refs[linkPath] = true;
            this._transformRef('add', refsPath, refs);

          } else {
            refsPath.push(linkPath);
            refs = this.retrieve(refsPath);
            if (!refs) {
              this._transformRef('add', refsPath, true);
            }
          }
        }
      },

      _removeRevLinks: function(path) {
    //    console.log('_removeRevLinks', path);

        var value = this.retrieve(path);
        if (value) {
          var _this = this,
              type = path[0],
              id = path[1],
              linkSchema,
              linkValue;

          if (path.length === 2) {
            // when a whole record is removed, remove any links that reference it
            if (value.__rev) {
    //          console.log('removeRefs from deleted record', type, id, value.__rev);

              var operation;
              Object.keys(value.__rev).forEach(function(path) {
                path = _this._doc.deserializePath(path);

                if (path.length === 4) {
                  operation = {
                    op: 'replace',
                    path: path,
                    value: null
                  };
                } else {
                  operation = {
                    op: 'remove',
                    path: path
                  };
                }

                try {
                  _this._transform(operation, _this.trackChanges);
                } catch(e) {
                  console.log('Cache._transform() exception:', e, 'operation:', operation);
                }
              });
            }

            // when a whole record is removed, remove references corresponding to each link
            if (value.__rel) {
              Object.keys(value.__rel).forEach(function(link) {
                linkSchema = _this.schema.models[type].links[link];
                linkValue = value.__rel[link];

                if (linkSchema.type === 'hasMany') {
                  Object.keys(linkValue).forEach(function(v) {
                    _this._removeRevLink(linkSchema, type, id, link, v);
                  });

                } else {
                  _this._removeRevLink(linkSchema, type, id, link, linkValue);
                }
              });
            }

          } else if (path.length > 3) {
            var link = path[3];

            linkSchema = _this.schema.models[type].links[link];

            if (path.length === 5) {
              linkValue = path[4];
            } else {
              linkValue = value;
            }

            this._removeRevLink(linkSchema, type, id, link, linkValue);
          }
        }
      },

      _removeRevLink: function(linkSchema, type, id, link, value) {
    //    console.log('_removeRevLink', linkSchema, type, id, link, value);

        if (value && typeof value === 'string') {
          var linkPath = [type, id, '__rel', link];
          if (linkSchema.type === 'hasMany') {
            linkPath.push(value);
          }
          linkPath = '/' + linkPath.join('/');

          var revLinkPath = [linkSchema.model, value, '__rev', linkPath];
          this._transformRef('remove', revLinkPath);
        }
      },

      _transformRef: function(op, path, value) {
        var operation = {
          op: op,
          path: path
        };
        if (value) {
          operation.value = value;
        }
        try {
          this._transform(operation, this.trackRevLinkChanges);
        } catch(e) {
          console.log('Cache._transformRef() exception', e, 'for operation', operation);
        }
      }
    };

    return Cache;
  });
define("orbit_common/id_map",
  ["orbit/lib/assert"],
  function(__dependency1__) {
    "use strict";
    var assert = __dependency1__.assert;

    var IdMap = function() {
      this.init.apply(this, arguments);
    };

    IdMap.prototype = {
      constructor: IdMap,

      init: function(idField, remoteIdField) {
        assert("IdMap's `idField` must be specified", idField);
        assert("IdMap's `remoteIdField` must be specified", remoteIdField);

        this.idField = idField;
        this.remoteIdField = remoteIdField;
        this.reset();
      },

      reset: function() {
        this._remoteToLocal = {};
        this._localToRemote = {};
      },

      register: function(type, id, remoteId) {
        if (id && remoteId) {
          var remoteToLocal = this._remoteToLocal[type];
          if (!remoteToLocal) remoteToLocal = this._remoteToLocal[type] = {};
          remoteToLocal[remoteId] = id;

          var localToRemote = this._localToRemote[type];
          if (!localToRemote) localToRemote = this._localToRemote[type] = {};
          localToRemote[id] = remoteId;
        }
      },

      registerAll: function(data) {
        if (data) {
          var _this = this,
              remoteToLocal,
              localToRemote,
              record,
              remoteId;

          Object.keys(data).forEach(function(type) {
            remoteToLocal = _this._remoteToLocal[type];
            if (!remoteToLocal) remoteToLocal = _this._remoteToLocal[type] = {};

            localToRemote = _this._localToRemote[type];
            if (!localToRemote) localToRemote = _this._localToRemote[type] = {};

            var typeData = data[type];
            Object.keys(typeData).forEach(function(id) {
              remoteId = typeData[id][_this.remoteIdField];
              if (remoteId) {
                remoteToLocal[remoteId] = id;
                localToRemote[id] = remoteId;
              }
            });
          });
        }
      },

      remoteToLocalId: function(type, remoteId) {
        if (remoteId) {
          var mapForType = this._remoteToLocal[type];
          if (mapForType) return mapForType[remoteId];
        }
      },

      localToRemoteId: function(type, id) {
        if (id) {
          var mapForType = this._localToRemote[type];
          if (mapForType) return mapForType[id];
        }
      }
    };

    return IdMap;
  });
define("orbit_common/lib/exceptions",
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     @module orbit-common
     */

    /**
     Exception thrown when an operation is not allowed.

     @class OperationNotAllowed
     @namespace OC
     @param {Object} description
     @constructor
     */
    var OperationNotAllowed = function(description) {
      this.description = description;
    };

    OperationNotAllowed.prototype = {
      constructor: OperationNotAllowed
    };

    /**
     Exception thrown when a record can not be found.

     @class RecordNotFoundException
     @namespace OC
     @param {String} type
     @param {Object} record
     @constructor
     */
    var RecordNotFoundException = function(type, record) {
      this.type = type;
      this.record = record;
    };

    RecordNotFoundException.prototype = {
      constructor: RecordNotFoundException
    };

    /**
     Exception thrown when a record can not be found.

     @class LinkNotFoundException
     @namespace OC
     @param {String} type
     @param {Object} record
     @constructor
     */
    var LinkNotFoundException = function(type, record, key) {
      this.type = type;
      this.record = record;
      this.key = key;
    };

    LinkNotFoundException.prototype = {
      constructor: LinkNotFoundException
    };

    /**
     Exception thrown when a record already exists.

     @class RecordAlreadyExistsException
     @namespace OC
     @param {String} type
     @param {Object} record
     @constructor
     */
    var RecordAlreadyExistsException = function(type, record) {
      this.type = type;
      this.record = record;
    };

    RecordAlreadyExistsException.prototype = {
      constructor: RecordAlreadyExistsException
    };


    __exports__.OperationNotAllowed = OperationNotAllowed;
    __exports__.RecordNotFoundException = RecordNotFoundException;
    __exports__.LinkNotFoundException = LinkNotFoundException;
    __exports__.RecordAlreadyExistsException = RecordAlreadyExistsException;
  });
define("orbit_common/main",
  [],
  function() {
    "use strict";
    /**
     The Orbit Common library (namespaced `OC` by default) defines a common set of
     compatible sources.

     The Common library contains a base abstract class, `Source`, which supports
     both `Transformable` and `Requestable` interfaces. The method signatures on
     `Source` should be supported by other sources that want to be fully compatible
     with the Common library.

     @module orbit-common
     @main orbit-common
     */

    /**
     Namespace for Orbit Common methods and classes.

     @class OC
     @static
     */
    var OC = {};

    return OC;
  });
define("orbit_common/memory_source",
  ["orbit/lib/assert","orbit/lib/objects","orbit_common/lib/exceptions","orbit/main","orbit_common/source"],
  function(__dependency1__, __dependency2__, __dependency3__, Orbit, Source) {
    "use strict";
    var assert = __dependency1__.assert;
    var extend = __dependency2__.extend;
    var isArray = __dependency2__.isArray;
    var isNone = __dependency2__.isNone;
    var RecordNotFoundException = __dependency3__.RecordNotFoundException;
    var LinkNotFoundException = __dependency3__.LinkNotFoundException;

    /**
     Source for storing in-memory data

     @class MemorySource
     @namespace OC
     @extends OC.Source
     @param schema
     @param options
     @constructor
     */
    var MemorySource = function() {
      this.init.apply(this, arguments);
    };

    extend(MemorySource.prototype, Source.prototype, {
      constructor: MemorySource,

      init: function(schema, options) {
        assert('MemorySource requires Orbit.Promise to be defined', Orbit.Promise);

        Source.prototype.init.apply(this, arguments);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Transformable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _transform: function(operation) {
        this._cache.transform(operation);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Requestable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _find: function(type, id) {
        var _this = this,
            idField = this.schema.idField,
            remoteIdField = this.schema.remoteIdField,
            result;

        return new Orbit.Promise(function(resolve, reject) {
          if (isNone(id)) {
            result = _this._filter.call(_this, type);

          } else if (isArray(id)) {
            var res,
                resId,
                notFound;

            result = [];
            notFound = [];

            for (var i = 0, l = id.length; i < l; i++) {
              resId =  id[i];

              if (typeof resId === 'object' && resId[remoteIdField]) {
                res = _this._filterOne.call(_this, type, remoteIdField, resId[remoteIdField]);
              } else {
                res =  _this.retrieve([type, resId]);
              }

              if (res) {
                result.push(res);
              } else {
                notFound.push(resId);
              }
            }

            if (notFound.length > 0) {
              result = null;
              id = notFound;
            }

          } else if (typeof id === 'object') {
            if (id[idField]) {
              result = _this.retrieve([type, id[idField]]);

            } else if (id[remoteIdField]) {
              result = _this._filterOne.call(_this, type, remoteIdField, id[remoteIdField]);

            } else {
              result = _this._filter.call(_this, type, id);
            }

          } else {
            result = _this.retrieve([type, id]);
          }

          if (result) {
            resolve(result);
          } else {
            reject(new RecordNotFoundException(type, id));
          }
        });
      },

      _findLink: function(type, id, key) {
        var _this = this,
            idField = this.schema.idField,
            record;

        return new Orbit.Promise(function(resolve, reject) {
          if (typeof id === 'object') {
            record = _this.retrieve([type, id[idField]]);

          } else {
            record = _this.retrieve([type, id]);
          }

          if (record) {
            var result;

            if (record.__rel) {
              result = record.__rel[key];

              if (result) {
                var linkDef = _this.schema.models[type].links[key],
                    relatedModel = linkDef.model;

                if (linkDef.type === 'hasMany') {
                  var relatedIds = Object.keys(result),
                      relatedRecord,
                      notFound;

                  result = [];
                  notFound = [];

                  relatedIds.forEach(function(relatedId) {
                    relatedRecord = _this.retrieve([relatedModel, relatedId]);
                    if (relatedRecord) {
                      result.push(relatedRecord);
                    } else {
                      notFound.push(relatedRecord);
                    }
                  });

                  if (notFound.length > 0) {
                    result = null;
                  }

                } else {
                  result = _this.retrieve([relatedModel, result]);
                }
              }
            }

            if (result) {
              resolve(result);

            } else {
              reject(new LinkNotFoundException(type, id, key));
            }

          } else {
            reject(new RecordNotFoundException(type, id));
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
            if (match) all.push(record);
          }
        }
        return all;
      },

      _filterOne: function(type, prop, value) {
        var dataForType,
            i,
            record;

        dataForType = this.retrieve([type]);

        for (i in dataForType) {
          if (dataForType.hasOwnProperty(i)) {
            record = dataForType[i];
            if (record[prop] === value) {
              return record;
            }
          }
        }
      }
    });

    return MemorySource;
  });
define("orbit_common/schema",
  ["orbit/lib/objects","orbit_common/lib/exceptions","orbit/evented","orbit_common/id_map"],
  function(__dependency1__, __dependency2__, Evented, IdMap) {
    "use strict";
    var clone = __dependency1__.clone;
    var OperationNotAllowed = __dependency2__.OperationNotAllowed;

    /**
     `Schema`

     Defines the models, attributes and relationships allowed in a source.

     A `Schema` also defines an ID field (`__id` by default) that is used across all
     Orbit sources to uniquely identify records.

     Unique IDs are specified with `generateId`. The default implementation of this
     method generates locally unique IDs ('TIMESTAMP.COUNTER'). If your server
     accepts UUIDs, you may wish to generate IDs client-side by setting `idField` to
     match your remote ID field and replace `generateID` with a UUID generator.

     Models should be keyed by their singular name, and should be defined as an
     object that optionally contains `attributes` and/or `links`.

     TODO - further specs needed for models

     @example

     ``` javascript
     var schema = new Schema({
       models: {
         planet: {
           attributes: {
             name: {type: 'string'},
             classification: {type: 'string'}
           },
           links: {
             moons: {type: 'hasMany', model: 'moon', inverse: 'planet'}
           }
         },
         moon: {
           attributes: {
             name: {type: 'string'}
           },
           links: {
             planet: {type: 'hasOne', model: 'planet', inverse: 'moons'}
           }
         }
       }
     });
     ```

     @class Schema
     @namespace OC
     @param {Object}   [options]
     @param {String}   [options.idField='__id'] Name of field that uniquely identifies records throughout Orbit
     @param {Function} [options.generateId] ID generator (the default generator ensures locally unique IDs but not UUIDs)
     @param {Object}   [options.models] schemas for individual models supported by this schema
     @constructor
     */
    var Schema = function() {
      this.init.apply(this, arguments);
    };

    Schema.prototype = {
      constructor: Schema,

      init: function(options) {
        options = options || {};
        this.idField = options.idField !== undefined ? options.idField : '__id';
        this.remoteIdField = options.remoteIdField !== undefined ? options.remoteIdField : 'id';
        this.models = options.models !== undefined ? options.models : {};
        if (options.generateId) {
          this.generateId = options.generateId;
        }
        if (this.idField !== this.remoteIdField) {
          this._idMap = new IdMap(this.idField, this.remoteIdField);
        }
        Evented.extend(this);
      },

      registerModel: function(type, definition) {
        this.models[type] = definition;
        this.emit('modelRegistered', type);
      },

      normalize: function(type, data) {
        if (data.__normalized) return data;

        var record = data; // TODO? clone(data);

        // set flag
        record.__normalized = true;

        // init id
        if (this._idMap) {
          var id = record[this.idField];
          var remoteId = record[this.remoteIdField];

          if (id === undefined) {
            if (remoteId) {
              id = this._idMap.remoteToLocalId(type, remoteId);
            }
            id = id || this.generateId();

            record[this.idField] = id;
          }

          this._idMap.register(type, id, remoteId);

        } else {
          record[this.idField] = record[this.idField] || this.generateId();
        }

        // init backward links
        record.__rev = record.__rev || {};

        // init forward links
        record.__rel = record.__rel || {};

        this.initDefaults(type, record);

        return record;
      },

      initDefaults: function(type, record) {
        if (!record.__normalized) {
          throw new OperationNotAllowed('Schema.initDefaults requires a normalized record');
        }

        var modelSchema = this.models[type],
            attributes = modelSchema.attributes,
            links = modelSchema.links;

        // init default attribute values
        if (attributes) {
          for (var attribute in attributes) {
            if (record[attribute] === undefined) {
              if (attributes[attribute].defaultValue) {
                if (typeof attributes[attribute].defaultValue === 'function') {
                  record[attribute] = attributes[attribute].defaultValue.call(record);
                } else {
                  record[attribute] = attributes[attribute].defaultValue;
                }
              } else {
                record[attribute] = null;
              }
            }
          }
        }

        // init default link values
        if (links) {
          for (var link in links) {
            if (record.__rel[link] === undefined) {
              if (links[link].type === 'hasMany') {
                record.__rel[link] = {};
              } else {
                record.__rel[link] = null;
              }
            }
          }
        }
      },

      generateId: function() {
        if (this._newId === undefined) this._newId = 0;
        return new Date().getTime() + '.' + (this._newId++).toString();
      },

      remoteToLocalId: function(type, remoteId) {
        if (this._idMap) {
          return this._idMap.remoteToLocalId(type, remoteId);
        } else {
          return remoteId;
        }
      },

      localToRemoteId: function(type, id) {
        if (this._idMap) {
          return this._idMap.localToRemoteId(type, id);
        } else {
          return id;
        }
      },

      registerIds: function(type, record) {
        if (this._idMap) {
          this._idMap.register(type, record[this.idField], record[this.remoteIdField]);
        }
      },

      registerAllIds: function(data) {
        if (this._idMap && data) {
          this._idMap.registerAll(data);
        }
      },

      pluralize: function(name) {
        // TODO - allow for pluggable inflector
        return name + 's';
      }
    };

    return Schema;
  });
define("orbit_common/source",
  ["orbit/lib/assert","orbit/lib/stubs","orbit/lib/objects","orbit/document","orbit/transformable","orbit/requestable","orbit_common/cache"],
  function(__dependency1__, __dependency2__, __dependency3__, Document, Transformable, Requestable, Cache) {
    "use strict";
    var assert = __dependency1__.assert;
    var required = __dependency2__.required;
    var expose = __dependency3__.expose;

    /**
     `Source` is an abstract base class to be extended by other sources.

     @class Source
     @namespace OC
     @param {OC.Schema} schema
     @param options
     @constructor
    */
    var Source = function() {
      this.init.apply(this, arguments);
    };

    Source.prototype = {
      constructor: Source,

      init: function(schema, options) {
        assert("Source's `schema` must be specified", schema);
        assert("Source's `schema.idField` must be specified", schema.idField);

        this.schema = schema;

        options = options || {};

        // Create an internal cache and expose some elements of its interface
        this._cache = new Cache(schema);
        expose(this, this._cache, 'length', 'reset', 'retrieve');
        // TODO - clean up listener
        this._cache.on('didTransform', this._cacheDidTransform, this);

        Transformable.extend(this);
        Requestable.extend(this, ['find', 'add', 'update', 'patch', 'remove', 'findLink', 'addLink', 'removeLink']);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Transformable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      /**
       Internal method that applies a single transform to this source.

       `_transform` must be implemented by a `Transformable` source.
       It is called by the public method `transform` in order to actually apply
       transforms.

       `_transform` should return a promise if the operation is asynchronous.

       @method _transform
       @param operation JSON PATCH operation as detailed in RFC 6902
       @private
       */
      _transform: required,

      /////////////////////////////////////////////////////////////////////////////
      // Requestable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _find: required,

      _findLink: required,

      _add: function(type, data) {
        var record = this.normalize(type, data);

        var id = this.getId(record),
            path = [type, id],
            _this = this;

        return this.transform({op: 'add', path: path, value: record}).then(function() {
          return _this.retrieve(path);
        });
      },

      _update: function(type, data) {
        var record = this.normalize(type, data);

        var id = this.getId(record),
            path = [type, id],
            _this = this;

        return this.transform({op: 'replace', path: path, value: record}).then(function() {
          return _this.retrieve(path);
        });
      },

      _patch: function(type, id, property, value) {
        if (typeof id === 'object') {
          var record = this.normalize(type, id);
          id = this.getId(record);
        }

        return this.transform({
          op: 'replace',
          path: [type, id].concat(Document.prototype.deserializePath(property)),
          value: value
        });
      },

      _remove: function(type, id) {
        if (typeof id === 'object') {
          var record = this.normalize(type, id);
          id = this.getId(record);
        }

        return this.transform({op: 'remove', path: [type, id]});
      },

      _addLink: function(type, id, key, value) {
        var linkOp = function(linkDef, type, id, key, value) {
          var path = [type, id, '__rel', key];
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

        var linkDef = this.schema.models[type].links[key],
            ops,
            _this = this;

        // Normalize ids
        if (typeof id === 'object') {
          var record = this.normalize(type, id);
          id = this.getId(record);
        }
        if (typeof value === 'object') {
          var relatedRecord = this.normalize(linkDef.model, value);
          value = this.getId(relatedRecord);
        }

        // Add link to primary resource
        ops = [linkOp(linkDef, type, id, key, value)];

        // Add inverse link if necessary
        if (linkDef.inverse) {
          var inverseLinkDef = this.schema.models[linkDef.model].links[linkDef.inverse];
          ops.push(linkOp(inverseLinkDef, linkDef.model, value, linkDef.inverse, id));
        }

        return this.transform(ops).then(function() {
          return _this.retrieve([type, id]);
        });
      },

      _removeLink: function(type, id, key, value) {
        var unlinkOp = function(linkDef, type, id, key, value) {
          var path = [type, id, '__rel', key];
          if (linkDef.type === 'hasMany') path.push(value);
          return {
            op: 'remove',
            path: path
          };
        };

        var linkDef = this.schema.models[type].links[key],
            ops,
            record,
            _this = this;

        // Normalize ids
        if (typeof id === 'object') {
          record = this.normalize(type, id);
          id = this.getId(record);
        }
        if (typeof value === 'object') {
          var relatedRecord = this.normalize(linkDef.model, value);
          value = this.getId(relatedRecord);
        }

        // Remove link from primary resource
        ops = [unlinkOp(linkDef, type, id, key, value)];

        // Remove inverse link if necessary
        if (linkDef.inverse) {
          if (value === undefined) {
            if (record === undefined) {
              record = this.retrieve(type, id);
            }
            value = record.__rel[key];
          }

          var inverseLinkDef = this.schema.models[linkDef.model].links[linkDef.inverse];
          ops.push(unlinkOp(inverseLinkDef, linkDef.model, value, linkDef.inverse, id));
        }

        return this.transform(ops).then(function() {
          return _this.retrieve([type, id]);
        });
      },

      /////////////////////////////////////////////////////////////////////////////
      // Event handlers
      /////////////////////////////////////////////////////////////////////////////

      _cacheDidTransform: function(operation, inverse) {
        this.didTransform(operation, inverse);
      },

      /////////////////////////////////////////////////////////////////////////////
      // Helpers
      /////////////////////////////////////////////////////////////////////////////

      normalize: function(type, data) {
        return this.schema.normalize(type, data);
      },

      initDefaults: function(type, record) {
        return this.schema.initDefaults(type, record);
      },

      getId: function(data) {
        return data[this.schema.idField];
      }
    };

    return Source;
  });