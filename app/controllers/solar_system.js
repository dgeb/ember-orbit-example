import SolarSystem from 'appkit/models/solar_system';

export default Em.ObjectController.extend({
  init: function() {
    this._super();
  },

  actions: {
    addPlanet: function(name) {
      this.get('model').addPlanet(name);
    },

    removePlanet: function(id) {
      this.get('model').removePlanet(id);
    },

    activateConnector: function(type) {
      this.get('model').activateConnector(type);
    },

    deactivateConnector: function(type) {
      this.get('model').deactivateConnector(type);
    }
  }
});
