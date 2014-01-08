export default Em.ArrayController.extend({
  init: function() {
    this._super();

    var previousSolarSystem;
    this.get('model').forEach(function(solarSystem) {
      if (previousSolarSystem) {
        solarSystem.connectTo(previousSolarSystem);
      }
      previousSolarSystem = solarSystem;
    });
  }
});
