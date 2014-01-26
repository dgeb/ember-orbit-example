define("orbit_common", 
  ["orbit_common/main","orbit_common/source","orbit_common/memory_source","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __exports__) {
    "use strict";
    var OC = __dependency1__["default"];
    var Source = __dependency2__["default"];
    var MemorySource = __dependency3__["default"];

    OC.Source = Source;
    OC.MemorySource = MemorySource;

    __exports__["default"] = OC;
  });
define("orbit_common/main", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
      Orbit Core Sources

      @module orbit-core-sources
    */

    /**
     * Namespace for Orbit Common methods and classes.
     *
     * @class OC
     * @static
     */
    var OC = {};

    __exports__["default"] = OC;
  });
define("orbit_common/lib/exceptions", 
  ["exports"],
  function(__exports__) {
    "use strict";
    /**
     * Exception thrown when a record can not be found.
     *
     * @class RecordNotFoundException
     * @param {String} type
     * @param record
     * @constructor
     */
    var RecordNotFoundException = function(type, record) {
      this.type = type;
      this.record = record;
    };

    RecordNotFoundException.prototype = {
      constructor: RecordNotFoundException
    };

    /**
     * Exception thrown when a record already exists.
     *
     * @class RecordAlreadyExistsException
     * @param {String} type
     * @param record
     * @constructor
     */
    var RecordAlreadyExistsException = function(type, record) {
      this.type = type;
      this.record = record;
    };

    RecordAlreadyExistsException.prototype = {
      constructor: RecordAlreadyExistsException
    };

    __exports__.RecordNotFoundException = RecordNotFoundException;
    __exports__.RecordAlreadyExistsException = RecordAlreadyExistsException;
  });
define("orbit_common/source", 
  ["orbit/cache","orbit/document","orbit/transformable","orbit/requestable","orbit/lib/assert","orbit/lib/stubs","orbit/lib/objects","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __dependency6__, __dependency7__, __exports__) {
    "use strict";
    var Cache = __dependency1__["default"];
    var Document = __dependency2__["default"];
    var Transformable = __dependency3__["default"];
    var Requestable = __dependency4__["default"];
    var assert = __dependency5__.assert;
    var required = __dependency6__.required;
    var expose = __dependency7__.expose;

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

        Transformable.extend(this);
        Requestable.extend(this, ['find', 'add', 'update', 'patch', 'remove', 'link', 'unlink']);
      },

      initRecord: required,

      /////////////////////////////////////////////////////////////////////////////
      // Transformable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _transform: required,

      /////////////////////////////////////////////////////////////////////////////
      // Requestable interface implementation
      /////////////////////////////////////////////////////////////////////////////

      _find: required,

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

    __exports__["default"] = Source;
  });
define("orbit_common/memory_source", 
  ["orbit/main","orbit_common/source","orbit/lib/assert","orbit/lib/objects","orbit_common/lib/exceptions","exports"],
  function(__dependency1__, __dependency2__, __dependency3__, __dependency4__, __dependency5__, __exports__) {
    "use strict";
    var Orbit = __dependency1__["default"];
    var Source = __dependency2__["default"];
    var assert = __dependency3__.assert;
    var extend = __dependency4__.extend;
    var RecordNotFoundException = __dependency5__.RecordNotFoundException;

    var MemorySource = function() {
      this.init.apply(this, arguments);
    };

    extend(MemorySource.prototype, Source.prototype, {
      constructor: MemorySource,

      init: function(schema, options) {
        assert('MemorySource requires Orbit.Promise to be defined', Orbit.Promise);

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
            if (record) {
              resolve(record);
            } else {
              reject(new RecordNotFoundException(type, id));
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
            if (match) all.push(record);
          }
        }
        return all;
      }
    });

    __exports__["default"] = MemorySource;
  });