import SolarSystem from 'appkit/models/solar_system';

export default Em.ObjectController.extend({
  planetName: null,

  actions: {
    addPlanet: function(name) {
      this.get('model').addPlanet(name);
      this.set('planetName', null);
    },

    removePlanet: function(id) {
      this.get('model').removePlanet(id);
    },

    undo: function() {
      this.get('model').undo();
    },

    toggleConnector: function(connector) {
      connector.toggle();
    }
  }
});
