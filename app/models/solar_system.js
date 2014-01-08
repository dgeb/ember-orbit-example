export default Ember.Object.extend({
  planets: null,
  transformConnectors: null,

  init: function() {
    this._super.apply(this, arguments);

    var _this = this;

    var schema = {
      idField: 'id',
      models: {
        planet: {
          attributes: {
            name: {type: 'string'}
          }
        }
      }
    };

    var orbitStore = new Orbit.LocalStorageSource(schema, {
      namespace: this.get('name')
    });

    orbitStore.on('didTransform', function(operation, inverse) {
      console.log('didTransform', operation, inverse);
      _this.reload();
    });

    this.set('orbitStore', orbitStore);

    _this.reload();
  },

  addPlanet: function(name) {
    this.get('orbitStore').add('planet', {name: name});
  },

  removePlanet: function(id) {
    this.get('orbitStore').remove('planet', id);
  },

  reload: function() {
    var _this = this;
    this.get('orbitStore').find('planet').then(function(planets) {
      _this.set('planets', planets);
    });
  },

  connectTo: function(connectedSolarSystem) {
    var fromConnector = new Orbit.TransformConnector(this.get('orbitStore'), connectedSolarSystem.get('orbitStore')),
        toConnector = new Orbit.TransformConnector(connectedSolarSystem.get('orbitStore'), this.get('orbitStore'));

    Ember.set(fromConnector, 'type', 'from');
    Ember.set(toConnector, 'type', 'to');

    Ember.set(fromConnector, 'active', true);
    Ember.set(toConnector, 'active', true);

    this.set('transformConnectors', [
      fromConnector,
      toConnector
    ]);
  },

  activateConnector: function(type) {
    var connector = this.getTransformConnector(type);
    connector.activate();
    Ember.set(connector, 'active', true);
  },

  deactivateConnector: function(type) {
    var connector = this.getTransformConnector(type);
    connector.deactivate();
    Ember.set(connector, 'active', false);
  },

  getTransformConnector: function(type) {
    var connector;
    this.get('transformConnectors').forEach(function(c) {
      if (c.type === type) {
        connector = c;
      }
    });
    return connector;
  }
});
