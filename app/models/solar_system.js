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

    this.get('store._source').on('didTransform', function(operation, inverse) {
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
      SolarSystemConnector.create({name: 'from', source: this.get('store._source'), target: connectedSolarSystem.get('store._source')}),
      SolarSystemConnector.create({name: 'to', source: connectedSolarSystem.get('store._source'), target: this.get('store._source')})
    ]);
  },

  undo: function() {
    var transformation = this.get('transformations').popObject(),
        _this = this;

    this.set('undoing', true);
    this.get('store._source').transform(transformation.inverse).then(function() {
      _this.set('undoing', false);
    });
  }
});
