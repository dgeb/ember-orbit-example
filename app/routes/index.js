import SolarSystem from 'appkit/models/solar_system';

function createSolarSystem(container, name) {
  return SolarSystem.create({
    store: EO.Store.create({
      container: container,
      orbitSourceClass: OC.LocalStorageSource,
      orbitSourceOptions: {
        namespace: name
      }
    }),
    name: name
  });
}

export default Ember.Route.extend({
  model: function() {
    var store = this.get('store');

    var a = createSolarSystem(store.container, 'A');
    var b = createSolarSystem(store.container, 'B');
    b.connectTo(a);

    return [a, b];
  }
});
