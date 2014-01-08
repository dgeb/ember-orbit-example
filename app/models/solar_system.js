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
    this.set('transformConnectors', [
      new Orbit.TransformConnector(this.get('orbitStore'), connectedSolarSystem.get('orbitStore')),
      new Orbit.TransformConnector(connectedSolarSystem.get('orbitStore'), this.get('orbitStore'))
    ]);
  },
});
