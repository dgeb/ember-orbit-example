import SolarSystem from 'appkit/models/solar_system';

export default Em.ObjectController.extend({
  init: function() {
    this._super();
  },

  actions: {
    add: function(name) {
      this.get('model').addPlanet(name);
    },

    remove: function(id) {
      this.get('model').removePlanet(id);
    }
  }
});
