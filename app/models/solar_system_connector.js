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

  symbol: function() {
    if (this.get('name') === 'from') {
      return '<<';
    } else {
      return '>>';
    }
  }.property('name'),

  toggle: function() {
    if (this.get('active')) {
      this.get('orbitConnector').deactivate();
      this.set('active', false);
    } else {
      this.get('orbitConnector').activate();
      this.set('active', true);
    }
  }
});
