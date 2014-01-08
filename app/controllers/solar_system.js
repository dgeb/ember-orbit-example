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

    undo: function() {
      this.get('model').undo();
    },

    activateConnector: function(connector) {
      connector.activate();
    },

    deactivateConnector: function(connector) {
      connector.deactivate();
    }
  }
});
