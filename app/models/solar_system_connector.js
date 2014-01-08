export default Ember.Object.extend({
  name: null,
  active: true,
  source: null,
  target: null,

  orbitConnector: null,

  init: function() {
    this._super.apply(this, arguments);
    this.set('orbitConnector', new Orbit.TransformConnector(this.get('source'), this.get('target')));
  },

  activate: function() {
    this.get('orbitConnector').activate();
    this.set('active', true);
  },

  deactivate: function() {
    this.get('orbitConnector').deactivate();
    this.set('active', false);
  }
});
