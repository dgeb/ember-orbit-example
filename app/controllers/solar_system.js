import SolarSystem from 'appkit/models/solar_system';

export default Em.ObjectController.extend({
  planetName: null,

  actions: {
    addPlanet: function(name) {
      var solarSystem = this.get('model');

      solarSystem.get('store').add('planet', {name: name});

      // clear entry field
      this.set('planetName', null);
    },

    removePlanet: function(planet) {
      planet.remove();
    },

    undo: function() {
      this.get('model').undo();
    },

    toggleConnector: function(connector) {
      connector.toggle();
    }
  }
});
