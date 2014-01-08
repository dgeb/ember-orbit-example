import SolarSystemConnector from 'appkit/models/solar_system_connector';

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

    // `id` is used for debugging / logging purposes
    orbitStore.id = this.get('name');

    orbitStore.on('didTransform', function(operation, inverse) {
      console.log(orbitStore.id, 'didTransform', operation, inverse);
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
      SolarSystemConnector.create({name: 'from', source: this.get('orbitStore'), target: connectedSolarSystem.get('orbitStore')}),
      SolarSystemConnector.create({name: 'to', source: connectedSolarSystem.get('orbitStore'), target: this.get('orbitStore')})
    ]);
  }
});
