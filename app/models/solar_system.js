import SolarSystemConnector from 'appkit/models/solar_system_connector';
import Transformation from 'appkit/models/transformation';

export default Ember.Object.extend({
  transformConnectors: null,
  transformations: null,
  undoing: false,

  init: function() {
    this._super.apply(this, arguments);

    var _this = this;

    this.set('transformations', []);

    this.get('store.orbitSource').on('didTransform', function(operation, inverse) {
      console.log(_this.get('name'), 'didTransform', operation, inverse);

      if (!_this.get('undoing')) {
        _this.get('transformations').pushObject(Transformation.create({
          operation: operation,
          inverse: inverse
        }));
      }
    });
  },

  planets: function() {
    return this.get('store').all('planet');
  }.property(),

  connectTo: function(connectedSolarSystem) {
    this.set('transformConnectors', [
      SolarSystemConnector.create({name: 'from', source: this.get('store.orbitSource'), target: connectedSolarSystem.get('store.orbitSource')}),
      SolarSystemConnector.create({name: 'to', source: connectedSolarSystem.get('store.orbitSource'), target: this.get('store.orbitSource')})
    ]);
  },

  undo: function() {
    var transformation = this.get('transformations').popObject(),
        _this = this;

    this.set('undoing', true);
    this.get('store.orbitSource').transform(transformation.inverse).then(function() {
      _this.set('undoing', false);
    });
  }
});
