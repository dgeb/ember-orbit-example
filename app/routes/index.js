import SolarSystem from 'appkit/models/solar_system';

export default Ember.Route.extend({
  model: function() {
    var a = SolarSystem.create({
      container: this.container,
      name: 'A'
    });

    var b = SolarSystem.create({
      container: this.container,
      name: 'B'
    });

    b.connectTo(a);

    return [a, b];
  }
});
