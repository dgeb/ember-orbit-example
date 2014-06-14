define("ember_orbit",
  ["ember_orbit/main","ember_orbit/store","ember_orbit/model","ember_orbit/record_array_manager","ember_orbit/schema","ember_orbit/source","ember_orbit/attr","ember_orbit/links/has_many_array","ember_orbit/links/has_one_object","ember_orbit/links/link_proxy_mixin","ember_orbit/record_arrays/filtered_record_array","ember_orbit/record_arrays/record_array","ember_orbit/relationships/has_many","ember_orbit/relationships/has_one"],
  function(EO, Store, Model, RecordArrayManager, Schema, Source, attr, HasManyArray, HasOneObject, LinkProxyMixin, FilteredRecordArray, RecordArray, hasMany, hasOne) {
    "use strict";

    EO.Store = Store;
    EO.Model = Model;
    EO.RecordArrayManager = RecordArrayManager;
    EO.Schema = Schema;
    EO.Source = Source;
    EO.attr = attr;
    EO.HasManyArray = HasManyArray;
    EO.HasOneObject = HasOneObject;
    EO.LinkProxyMixin = LinkProxyMixin;
    EO.FilteredRecordArray = FilteredRecordArray;
    EO.RecordArray = RecordArray;
    EO.hasOne = hasOne;
    EO.hasMany = hasMany;


    return EO;
  });
define("ember_orbit/attr",
  [],
  function() {
    "use strict";
    var attr = function(type, options) {
      options = options || {};
      options.type = type;

      var meta = {
        options: options,
        isAttribute: true
      };

      return Ember.computed(function(key, value) {
        if (arguments.length > 1) {
          var oldValue = this.getAttribute(key);

          if (value !== oldValue) {
            this.patch(key, value);
          }

          return value;

        } else {
          return this.getAttribute(key);
        }
      }).meta(meta);
    };


    return attr;
  });
define("ember_orbit/links/has_many_array",
  ["ember_orbit/record_arrays/record_array","ember_orbit/links/link_proxy_mixin"],
  function(RecordArray, LinkProxyMixin) {
    "use strict";

    var get = Ember.get,
        set = Ember.set;

    var forEach = Ember.EnumerableUtils.forEach;

    /**
     @module ember-orbit
    */

    /**
     A `HasManyArray` is a `RecordArray` that represents the contents of a has-many
     relationship.

     @class HasManyArray
     @namespace EO
     @extends EO.RecordArray
    */
    var HasManyArray = RecordArray.extend(LinkProxyMixin, {

      arrayContentWillChange: function(index, removed, added) {
        var store = get(this, 'store');
        var idField = get(store, 'idField');
        var ownerType = get(this, '_ownerType');
        var ownerId = get(this, '_ownerId');
        var linkKey = get(this, '_linkKey');
        var content = get(this, 'content');
        var record, recordId;

        for (var i = index; i < index + removed; i++) {
          record = content.objectAt(i);
          recordId = get(record, idField);
          store.removeLink(ownerType, ownerId, linkKey, recordId);
        }

        return this._super.apply(this, arguments);
      },

      arrayContentDidChange: function(index, removed, added) {
        this._super.apply(this, arguments);

        var store = get(this, 'store');
        var idField = get(store, 'idField');
        var ownerType = get(this, '_ownerType');
        var ownerId = get(this, '_ownerId');
        var linkKey = get(this, '_linkKey');
        var content = get(this, 'content');
        var record, recordId;

        for (var i = index; i < index + added; i++) {
          record = content.objectAt(i);
          recordId = get(record, idField);
          store.addLink(ownerType, ownerId, linkKey, recordId);
        }
      }

    });


    return HasManyArray;
  });
define("ember_orbit/links/has_one_object",
  ["ember_orbit/links/link_proxy_mixin"],
  function(LinkProxyMixin) {
    "use strict";

    /**
     @module ember-orbit
    */

    /**
     A `HasOneObject` is an `ObjectProxy` that represents the contents of a has-one
     relationship.

     @class HasOneObject
     @namespace EO
     @extends Ember.ObjectProxy
    */
    var HasOneObject = Ember.ObjectProxy.extend(LinkProxyMixin);


    return HasOneObject;
  });
define("ember_orbit/links/link_proxy_mixin",
  [],
  function() {
    "use strict";
    var get = Ember.get,
        set = Ember.set;

    var LinkProxyMixin = Ember.Mixin.create({
      store: null,

      _ownerId: null,

      _ownerType: null,

      _linkKey: null,

      find: function() {
        var store = get(this, 'store');
        var promise = store.findLink.call(store,
          get(this, '_ownerType'),
          get(this, '_ownerId'),
          get(this, '_linkKey')
        );
        return promise;
      }
    });

    return LinkProxyMixin;
  });
define("ember_orbit/main",
  [],
  function() {
    "use strict";
    var EO = {};

    return EO;
  });
define("ember_orbit/model",
  ["ember_orbit/links/has_one_object","ember_orbit/links/has_many_array"],
  function(HasOneObject, HasManyArray) {
    "use strict";

    var get = Ember.get;

    /**
     @class Model
     @namespace EO
    */
    var Model = Ember.Object.extend(Ember.Evented, {
      getAttribute: function(key) {
        var store = get(this, 'store');
        var type = this.constructor.typeKey;
        var id = get(this, get(store, 'idField'));

        return store.retrieveAttribute(type, id, key);
      },

      getLink: function(key) {
        var store = get(this, 'store');
        var type = this.constructor.typeKey;
        var id = get(this, get(store, 'idField'));

        var relatedRecord = store.retrieveLink(type, id, key) || null;

        var hasOneObject = HasOneObject.create({
          content: relatedRecord,
          store: store,
          _ownerId: id,
          _ownerType: type,
          _linkKey: key
        });

        this._assignLink(key, hasOneObject);

        return hasOneObject;
      },

      getLinks: function(key) {
        var store = get(this, 'store');
        var type = this.constructor.typeKey;
        var id = get(this, get(store, 'idField'));

        var relatedRecords = store.retrieveLinks(type, id, key) || Ember.A();

        var hasManyArray = HasManyArray.create({
          content: relatedRecords,
          store: this.store,
          _ownerId: id,
          _ownerType: type,
          _linkKey: key
        });

        this._assignLink(key, hasManyArray);

        return hasManyArray;
      },

      patch: function(key, value) {
        var store = get(this, 'store');
        var type = this.constructor.typeKey;
        var id = get(this, get(store, 'idField'));

        return store.patch(type, id, key, value);
      },

      addLink: function(key, relatedRecord) {
        var store = get(this, 'store');
        var type = this.constructor.typeKey;
        var id = get(this, get(store, 'idField'));
        var relatedId = get(relatedRecord, get(store, 'idField'));

        return store.addLink(type, id, key, relatedId);
      },

      removeLink: function(key, relatedRecord) {
        var store = get(this, 'store');
        var type = this.constructor.typeKey;
        var id = get(this, get(store, 'idField'));
        var relatedId = get(relatedRecord, get(store, 'idField'));

        return store.removeLink(type, id, key, relatedId);
      },

      remove: function() {
        var store = get(this, 'store');
        var type = this.constructor.typeKey;
        var id = get(this, get(store, 'idField'));

        return store.remove(type, id);
      },

      willDestroy: function() {
        this._super();

        var store = get(this, 'store');
        var type = this.constructor.typeKey;
        var id = get(this, get(store, 'idField'));

        store.unload(type, id);
      },

      _assignLink: function(key, value) {
        this._links = this._links || {};
        this._links[key] = value;
      }
    });

    Model.reopenClass({
      _create: Model.create,

      create: function() {
        throw new Ember.Error("You should not call `create` on a model. Instead, call `store.add` with the attributes you would like to set.");
      },

      attributes: Ember.computed(function() {
        var map = {};

        this.eachComputedProperty(function(name, meta) {
          if (meta.isAttribute) {
            meta.name = name;
            map[name] = meta.options;
          }
        });

        return map;
      }),

      links: Ember.computed(function() {
        var map = {};

        this.eachComputedProperty(function(name, meta) {
          if (meta.isLink) {
            meta.name = name;
            map[name] = meta.options;
          }
        });

        return map;
      })
    });


    return Model;
  });
define("ember_orbit/record_array_manager",
  ["ember_orbit/record_arrays/record_array","ember_orbit/record_arrays/filtered_record_array"],
  function(RecordArray, FilteredRecordArray) {
    "use strict";
    /**
      @module ember-orbit
    */


    var get = Ember.get,
        set = Ember.set;

    var forEach = Ember.EnumerableUtils.forEach;

    /**
      @class RecordArrayManager
      @namespace EO
      @private
      @extends Ember.Object
    */
    var RecordArrayManager = Ember.Object.extend({
      init: function() {
        this.filteredRecordArrays = Ember.MapWithDefault.create({
          defaultValue: function() { return []; }
        });

        this.changes = [];
      },

      recordDidChange: function(record, operation) {
        if (this.changes.push({record: record, operation: operation}) !== 1) { return; }
        Ember.run.schedule('actions', this, this._processChanges);
      },

      /**
       This method is invoked whenever data is changed in the store.

       It updates all record arrays that a record belongs to.

       To avoid thrashing, it only runs at most once per run loop.

       @method _processChanges
       @private
      */
      _processChanges: function() {
        forEach(this.changes, function(change) {
          this._processChange(change.record, change.operation);
        }, this);

        this.changes.length = 0;
      },

      _processChange: function(record, operation) {
        console.log('_processChange', record, operation);

        var path = operation.path,
            op = operation.op,
            value = operation.value;

        if (path.length === 2) {
          if (op === 'add') {
            this._recordWasChanged(record);
            return;

          } else if (op === 'remove') {
            this._recordWasDeleted(record);
            return;
          }

        } else if (path.length === 3 || path.length === 4) {
          this._recordWasChanged(record);
          return;

        } else if (path.length === 5) {
          if (op === 'add') {
            this._linkWasAdded(record, path[3], path[4]);
            return;

          } else if (op === 'remove') {
            this._linkWasRemoved(record, path[3], path[4]);
            return;
          }
        }

        console.log('!!!! unhandled change', path.length, operation);
      },

      _recordWasDeleted: function(record) {
        var recordArrays = record._recordArrays;

        if (recordArrays) {
          forEach(recordArrays, function(array) {
            array.removeObject(record);
          });
        }

        record.destroy();
      },

      _recordWasChanged: function(record) {
        var type = record.constructor.typeKey,
            recordArrays = this.filteredRecordArrays.get(type),
            filter;

        if (recordArrays) {
          forEach(recordArrays, function(array) {
            filter = get(array, 'filterFunction');
            this.updateRecordArray(array, filter, type, record);
          }, this);
        }
      },

      _linkWasAdded: function(record, key, value) {
        var type = record.constructor.typeKey;
        var store = get(this, 'store');
        var linkType = get(store, 'schema').linkProperties(type, key).model;

        if (linkType) {
          var relatedRecord = store.retrieve(linkType, value);
          var links = get(record, key);

          if (links && relatedRecord) {
            links.addObject(relatedRecord);
          }
        }
      },

      _linkWasRemoved: function(record, key, value) {
        var type = record.constructor.typeKey;
        var store = get(this, 'store');
        var linkType = get(store, 'schema').linkProperties(type, key).model;

        if (linkType) {
          var relatedRecord = store.retrieve(linkType, value);
          var links = get(record, key);

          if (links && relatedRecord) {
            links.removeObject(relatedRecord);
          }
        }
      },

      /**
       Update an individual filter.

       @method updateRecordArray
       @param {EO.RecordArray} array
       @param {Function} filter
       @param {String} type
       @param {EO.Model} record
      */
      updateRecordArray: function(array, filter, type, record) {
        var shouldBeInArray;

        if (!filter) {
          shouldBeInArray = true;
        } else {
          shouldBeInArray = filter(record);
        }

        if (shouldBeInArray) {
          array.addObject(record);
        } else {
          array.removeObject(record);
        }
      },

      /**
       This method is invoked if the `filterFunction` property is
       changed on a `EO.FilteredRecordArray`.

       It essentially re-runs the filter from scratch. This same
       method is invoked when the filter is created in th first place.

       @method updateFilter
       @param array
       @param type
       @param filter
      */
      updateFilter: function(array, type, filter) {
        var records = this.store.retrieve(type),
            record;

        for (var i=0, l=records.length; i<l; i++) {
          record = records[i];

          if (!get(record, 'isDeleted')) {
            this.updateRecordArray(array, filter, type, record);
          }
        }
      },

      /**
       Create a `EO.RecordArray` for a type and register it for updates.

       @method createRecordArray
       @param {String} type
       @return {EO.RecordArray}
      */
      createRecordArray: function(type) {
        var array = RecordArray.create({
          type: type,
          content: Ember.A(),
          store: this.store
        });

        this.registerFilteredRecordArray(array, type);

        return array;
      },

      /**
        Create a `EO.FilteredRecordArray` for a type and register it for updates.

        @method createFilteredRecordArray
        @param {Class} type
        @param {Function} filter
        @param {Object} query (optional)
        @return {EO.FilteredRecordArray}
      */
      createFilteredRecordArray: function(type, filter, query) {
        var array = FilteredRecordArray.create({
          query: query,
          type: type,
          content: Ember.A(),
          store: this.store,
          manager: this,
          filterFunction: filter
        });

        this.registerFilteredRecordArray(array, type, filter);

        return array;
      },

      /**
        Register a RecordArray for a given type to be backed by
        a filter function. This will cause the array to update
        automatically when records of that type change attribute
        values or states.

        @method registerFilteredRecordArray
        @param {EO.RecordArray} array
        @param {Class} type
        @param {Function} filter
      */
      registerFilteredRecordArray: function(array, type, filter) {
        var recordArrays = this.filteredRecordArrays.get(type);
        recordArrays.push(array);

        this.updateFilter(array, type, filter);
      },

      willDestroy: function(){
        this._super();

        flatten(values(this.filteredRecordArrays.values)).forEach(destroy);
      }
    });

    function values(obj) {
      var result = [];
      var keys = Ember.keys(obj);

      for (var i = 0; i < keys.length; i++) {
        result.push(obj[keys[i]]);
      }

      return result;
    }

    function destroy(entry) {
      entry.destroy();
    }

    function flatten(list) {
      var length = list.length;
      var result = Ember.A();

      for (var i = 0; i < length; i++) {
        result = result.concat(list[i]);
      }

      return result;
    }


    return RecordArrayManager;
  });
define("ember_orbit/record_arrays/filtered_record_array",
  ["ember_orbit/record_arrays/record_array"],
  function(RecordArray) {
    "use strict";

    /**
      @module ember-orbit
    */

    var get = Ember.get;

    /**
      Represents a list of records whose membership is determined by the
      store. As records are created, loaded, or modified, the store
      evaluates them to determine if they should be part of the record
      array.

      @class FilteredRecordArray
      @namespace EO
      @extends EO.RecordArray
    */
    var FilteredRecordArray = RecordArray.extend({
      /**
        The filterFunction is a function used to test records from the store to
        determine if they should be part of the record array.

        Example

        ```javascript
        var allPeople = store.all('person');
        allPeople.mapBy('name'); // ["Tom Dale", "Yehuda Katz", "Trek Glowacki"]

        var people = store.filter('person', function(person) {
          if (person.get('name').match(/Katz$/)) { return true; }
        });
        people.mapBy('name'); // ["Yehuda Katz"]

        var notKatzFilter = function(person) {
          return !person.get('name').match(/Katz$/);
        };
        people.set('filterFunction', notKatzFilter);
        people.mapBy('name'); // ["Tom Dale", "Trek Glowacki"]
        ```

        @method filterFunction
        @param {EO.Model} record
        @return {Boolean} `true` if the record should be in the array
      */
      filterFunction: null,

      replace: function() {
        var type = get(this, 'type').toString();
        throw new Error("The result of a client-side filter (on " + type + ") is immutable.");
      },

      /**
        @method updateFilter
        @private
      */
      _updateFilter: function() {
        var manager = get(this, 'manager');
        manager.updateFilter(this, get(this, 'type'), get(this, 'filterFunction'));
      },

      updateFilter: Ember.observer(function() {
        Ember.run.once(this, this._updateFilter);
      }, 'filterFunction')
    });


    return FilteredRecordArray;
  });
define("ember_orbit/record_arrays/record_array",
  [],
  function() {
    "use strict";
    /**
      @module ember-orbit
    */

    var get = Ember.get,
        set = Ember.set;

    var forEach = Ember.EnumerableUtils.forEach;

    /**
     A record array is an array that contains records of a certain type. The record
     array materializes records as needed when they are retrieved for the first
     time. You should not create record arrays yourself. Instead, an instance of
     `EO.RecordArray` or its subclasses will be returned by your application's store
     in response to queries.

     @class RecordArray
     @namespace EO
     @extends Ember.ArrayProxy
     @uses Ember.Evented
    */

    var RecordArray = Ember.ArrayProxy.extend(Ember.Evented, {
      init: function() {
        this._super();
        this._recordsAdded(get(this, 'content'));
      },

      willDestroy: function() {
        this._recordsRemoved(get(this, 'content'));
        this._super();
      },

      /**
       The model type contained by this record array.

       @property type
       @type String
      */
      type: null,

      /**
       The store that created this record array.

       @property store
       @type EO.Store
      */
      store: null,

      /**
       Adds a record to the `RecordArray`.

       @method addObject
       @param {EO.Model} record
      */
      addObject: function(record) {
        get(this, 'content').addObject(record);
        this._recordAdded(record);
      },

      /**
       Removes a record from the `RecordArray`.

       @method removeObject
       @param {EO.Model} record
      */
      removeObject: function(record) {
        get(this, 'content').removeObject(record);
        this._recordRemoved(record);
      },

      _recordAdded: function(record) {
        this._recordArraysForRecord(record).add(this);
      },

      _recordRemoved: function(record) {
        this._recordArraysForRecord(record).remove(this);
      },

      _recordsAdded: function(records) {
        forEach(records, function(record) {
          this._recordAdded(record);
        }, this);
      },

      _recordsRemoved: function(records) {
        forEach(records, function(record) {
          this._recordRemoved(record);
        }, this);
      },

      _recordArraysForRecord: function(record) {
        record._recordArrays = record._recordArrays || Ember.OrderedSet.create();
        return record._recordArrays;
      }
    });


    return RecordArray;
  });
define("ember_orbit/relationships/has_many",
  [],
  function() {
    "use strict";
    var hasMany = function(model, options) {
      options = options || {};
      options.type = 'hasMany';
      options.model = model;

      var meta = {
        options: options,
        isLink: true
      };

      return Ember.computed(function(key) {
        return this.getLinks(key);
      }).meta(meta).readOnly();
    };


    return hasMany;
  });
define("ember_orbit/relationships/has_one",
  [],
  function() {
    "use strict";
    var get = Ember.get,
        set = Ember.set;

    var hasOne = function(model, options) {
      options = options || {};
      options.type = 'hasOne';
      options.model = model;

      var meta = {
        options: options,
        isLink: true
      };

      return Ember.computed(function(key, value) {
        var proxy = this.getLink(key);

        if (arguments.length > 1) {
          if (value !== get(proxy, 'content')) {
            proxy.setProperties({
              content: value,
              promise: this.addLink(key, value)
            });
          }
        }

        return proxy;

      }).meta(meta);
    };


    return hasOne;
  });
define("ember_orbit/schema",
  ["orbit_common/schema"],
  function(OrbitSchema) {
    "use strict";

    var get = Ember.get;

    var Schema = Ember.Object.extend({
      /**
       @property idField
       @type {String}
       @default 'clientid'
       */
      idField: 'clientid',

      /**
       @property remoteIdField
       @type {String}
       @default 'id'
       */
      remoteIdField: 'id',

      init: function() {
        this._super.apply(this, arguments);
        this._modelTypeMap = {};
      },

      _schema: function() {
        // Delay creation of the underlying Orbit.Schema until
        // its been requested. This allows for setting of `idField`
        // and `remoteIdField`.
        var schema = new OrbitSchema({
          idField: get(this, 'idField'),
          remoteIdField: get(this, 'remoteIdField')
        });

        return schema;

      }.property(),

      defineModel: function(type, modelClass) {
        var _schema = get(this, '_schema');
        var definedModels = _schema.models;
        if (!definedModels[type]) {
          _schema.registerModel(type, {
            attributes: get(modelClass, 'attributes'),
            links: get(modelClass, 'links')
          });
        }
      },

      modelFor: function(type) {
        Ember.assert("`type` must be a string", typeof type === 'string');

        var model = this._modelTypeMap[type];
        if (!model) {
          model = this.container.lookupFactory('model:' + type);
          if (!model) {
            throw new Ember.Error("No model was found for '" + type + "'");
          }
          model.typeKey = type;

          // ensure model is defined in underlying OC.Schema
          this.defineModel(type, model);

          // save model in map for faster lookups
          this._modelTypeMap[type] = model;
        }

        return model;
      },

      initRecord: function(type, record) {
        return get(this, '_schema').initRecord(type, record);
      },

      models: function() {
        return Object.keys(get(this, '_schema').models);
      },

      attributes: function(type) {
        return Object.keys(get(this, '_schema').models[type].attributes);
      },

      attributeProperties: function(type, name) {
        return get(this, '_schema').models[type].attributes[name];
      },

      links: function(type) {
        return Object.keys(get(this, '_schema').models[type].links);
      },

      linkProperties: function(type, name) {
        return get(this, '_schema').models[type].links[name];
      }
    });

    return Schema;
  });
define("ember_orbit/source",
  ["ember_orbit/schema","orbit_common/source"],
  function(Schema, OCSource) {
    "use strict";

    var get = Ember.get,
        set = Ember.set;

    var Source = Ember.Object.extend({
      SourceClass: null,
      schema: null,

      /**
       @method init
       @private
       */
      init: function() {
        this._super.apply(this, arguments);

        var SourceClass = get(this, 'SourceClass');
        Ember.assert("Source.SourceClass must be initialized with an instance of an `OC.Source`",
          SourceClass);

        var schema = get(this, 'schema');
        if (!schema) {
          var container = get(this, 'container');
          schema = container.lookup('schema:main');
          set(this, 'schema', schema);
        }

        this._source = new SourceClass(get(schema, '_schema'));
      }

    });

    return Source;
  });
define("ember_orbit/store",
  ["ember_orbit/source","ember_orbit/model","ember_orbit/record_array_manager","orbit_common/memory_source"],
  function(Source, Model, RecordArrayManager, OCMemorySource) {
    "use strict";

    var get = Ember.get,
        set = Ember.set;

    var Promise = Ember.RSVP.Promise;

    var PromiseArray = Ember.ArrayProxy.extend(Ember.PromiseProxyMixin);
    function promiseArray(promise, label) {
      return PromiseArray.create({
        promise: Promise.cast(promise, label)
      });
    }

    var Store = Source.extend({
      SourceClass: OCMemorySource,

      schema: null,
      idField: Ember.computed.alias('schema.idField'),

      init: function() {
        this._super.apply(this, arguments);

        this.typeMaps = {};

        this._source.on('didTransform', this._didTransform, this);

        this._requests = Ember.OrderedSet.create();

        this._recordArrayManager = RecordArrayManager.create({
          store: this
        });
      },

      then: function(success, failure) {
        return Ember.RSVP.all(this._requests.toArray()).then(success, failure);
      },

      willDestroy: function() {
        this._source.off('didTransform', this.didTransform, this);
        this._recordArrayManager.destroy();
        this._super.apply(this, arguments);
      },

      typeMapFor: function(type) {
        var typeMap = this.typeMaps[type];

        if (typeMap) return typeMap;

        typeMap = {
          records: {},
          type: type
        };

        this.typeMaps[type] = typeMap;

        return typeMap;
      },

      transform: function(operation) {
        return this._source.transform(operation);
      },

      all: function(type) {
        this._verifyType(type);

        var typeMap = this.typeMapFor(type),
            findAllCache = typeMap.findAllCache;

        if (findAllCache) { return findAllCache; }

        var array = this._recordArrayManager.createRecordArray(type);

        typeMap.findAllCache = array;
        return array;
      },

      filter: function(type, query, filter) {
        this._verifyType(type);

        var length = arguments.length;
        var hasQuery = length === 3;
        var promise;
        var array;

        if (hasQuery) {
          promise = this.find(type, query);
        } else if (length === 2) {
          filter = query;
        }

        if (hasQuery) {
          array = this._recordArrayManager.createFilteredRecordArray(type, filter, query);
        } else {
          array = this._recordArrayManager.createFilteredRecordArray(type, filter);
        }

        promise = promise || Promise.cast(array);

        return promiseArray(promise.then(function() {
          return array;
        }, null, "OE: Store#filter of " + type));
      },

      find: function(type, id) {
        var _this = this;
        this._verifyType(type);

        var promise = this._source.find(type, id).then(function(data) {
          return _this._lookupFromData(type, data);
        });

        return this._request(promise);
      },

      add: function(type, properties) {
        var _this = this;
        this._verifyType(type);

        // TODO: normalize properties
        var promise = this._source.add(type, properties).then(function(data) {
          return _this._lookupFromData(type, data);
        });

        return this._request(promise);
      },

      remove: function(type, id) {
        this._verifyType(type);

        var promise = this._source.remove(type, id);

        return this._request(promise);
      },

      patch: function(type, id, key, value) {
        this._verifyType(type);

        var promise = this._source.patch(type, id, key, value);

        return this._request(promise);
      },

      addLink: function(type, id, key, relatedId) {
        this._verifyType(type);

        var promise = this._source.addLink(type, id, key, relatedId);

        return this._request(promise);
      },

      removeLink: function(type, id, key, relatedId) {
        this._verifyType(type);

        var promise = this._source.removeLink(type, id, key, relatedId);

        return this._request(promise);
      },

      findLink: function(type, id, key) {
        var _this = this;
        this._verifyType(type);

        var linkType = get(this, 'schema').linkProperties(type, key).model;

        var promise = this._source.findLink(type, id, key).then(function(data) {
          return _this._lookupFromData(linkType, data);
        });

        return this._request(promise);
      },

      retrieve: function(type, id) {
        this._verifyType(type);

        var ids;
        if (arguments.length === 1) {
          ids = Object.keys(this._source.retrieve([type]));

        } else if (Ember.isArray(id)) {
          ids = id;
        }

        if (ids) {
          return this._lookupRecords(type, ids);

        } else {
          if (typeof id === 'object') {
            var idField = get(this, 'idField');
            id = get(id, idField);
          }
          if (this._source.retrieve([type, id])) {
            return this._lookupRecord(type, id);
          }
        }
      },

      retrieveAttribute: function(type, id, key) {
        this._verifyType(type);

        return this._source.retrieve([type, id, key]);
      },

      retrieveLink: function(type, id, key) {
        this._verifyType(type);

        var linkType = get(this, 'schema').linkProperties(type, key).model;

        var relatedId = this._source.retrieve([type, id, '__rel', key]);

        if (linkType && relatedId) {
          return this.retrieve(linkType, relatedId);
        }
      },

      retrieveLinks: function(type, id, key) {
        this._verifyType(type);

        var linkType = get(this, 'schema').linkProperties(type, key).model;

        var relatedIds = Object.keys(this._source.retrieve([type, id, '__rel', key]));

        if (linkType && Ember.isArray(relatedIds) && relatedIds.length > 0) {
          return this.retrieve(linkType, relatedIds);
        }
      },

      unload: function(type, id) {
        this._verifyType(type);

        var typeMap = this.typeMapFor(type);
        delete typeMap.records[id];
      },

      _verifyType: function(type) {
        Ember.assert("`type` must be registered as a model in the container", get(this, 'schema').modelFor(type));
      },

      _didTransform: function(operation, inverse) {
        console.log('_didTransform', operation, inverse);

        var op = operation.op,
            path = operation.path,
            value = operation.value,
            record = this._lookupRecord(path[0], path[1]);

        if (path.length === 3) {
          // attribute changed
          record.propertyDidChange(path[2]);

        } else if (path.length === 4) {
          // hasOne link changed
          var key = path[3];
          var link = this.retrieveLink(path[0], path[1], key);
          record.set(key, link);
        }

        // trigger record array changes
        this._recordArrayManager.recordDidChange(record, operation);
      },

      _lookupRecord: function(type, id) {
        var typeMap = this.typeMapFor(type),
            record = typeMap.records[id];

        if (record === undefined) {
          var model = get(this, 'schema').modelFor(type);

          var data = {
            store: this
          };
          data[get(this, 'idField')] = id;

          record = model._create(data);

          typeMap.records[id] = record;
        }

        return record;
      },

      _lookupRecords: function(type, ids) {
        var _this = this;
        return ids.map(function(id) {
          return _this._lookupRecord(type, id);
        });
      },

      _lookupFromData: function(type, data) {
        var idField = get(this, 'idField');
        if (Ember.isArray(data)) {
          var ids = data.map(function(recordData) {
            return recordData[idField];
          });
          return this._lookupRecords(type, ids);
        } else {
          return this._lookupRecord(type, data[idField]);
        }
      },

      _request: function(promise) {
        var requests = this._requests;
        requests.add(promise);
        return promise.finally(function() {
          requests.remove(promise);
        });
      }
    });

    return Store;
  });