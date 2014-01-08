import SolarSystemConnector from 'appkit/models/solar_system_connector';
import Transformation from 'appkit/models/transformation';

export default Ember.Object.extend({
  planets: null,
  transformConnectors: null,
  transformations: null,
  undoing: false,

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

    this.set('orbitStore', orbitStore);

    this.set('transformations', []);

    // Reload content on every transform
    orbitStore.on('didTransform', function(operation, inverse) {
      console.log(orbitStore.id, 'didTransform', operation, inverse);

      if (!_this.get('undoing')) {
        _this.get('transformations').pushObject(Transformation.create({
          operation: operation,
          inverse: inverse
        }));
      }

      _this.reload();
    });

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

  undo: function() {
    var transformation = this.get('transformations').popObject(),
        _this = this;

    this.set('undoing', true);
    this.get('orbitStore').transform(transformation.inverse).then(function() {
      _this.set('undoing', false);
    });
  },

  connectTo: function(connectedSolarSystem) {
    this.set('transformConnectors', [
      SolarSystemConnector.create({name: 'from', source: this.get('orbitStore'), target: connectedSolarSystem.get('orbitStore')}),
      SolarSystemConnector.create({name: 'to', source: connectedSolarSystem.get('orbitStore'), target: this.get('orbitStore')})
    ]);
  }
});
