import SolarSystem from 'appkit/models/solar_system';

export default Ember.Route.extend({
  model: function() {
    var primary = SolarSystem.create({name: 'Primary'});
    var secondary = SolarSystem.create({name: 'Secondary'});

    return [ primary, secondary ];
  }
});
