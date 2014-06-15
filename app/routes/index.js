import SolarSystem from 'appkit/models/solar_system';

function createSolarSystem(store, name) {
  return SolarSystem.create({
    store: store.clone({
      SourceClass: OC.LocalStorageSource,
      options: {
        namespace: name
      }
    }),
    name: name
  });
}

export default Ember.Route.extend({
  model: function() {
    var store = this.get('store');

    var a = createSolarSystem(store, 'A');
    var b = createSolarSystem(store, 'B');
    b.connectTo(a);

    return [a, b];
  }
});
