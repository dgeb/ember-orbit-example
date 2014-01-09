import SolarSystem from 'appkit/models/solar_system';

export default Ember.Route.extend({
  model: function() {
    var primary = SolarSystem.create({name: 'A'});
    var secondary = SolarSystem.create({name: 'B'});

    return [primary, secondary];
  }
});
