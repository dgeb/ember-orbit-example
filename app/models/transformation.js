export default Ember.Object.extend({
  operation: null,
  inverse: null,

  operationJSON: function() {
    return JSON.stringify(this.get('operation'));
  }.property('operation'),

  inverseJSON: function() {
    return JSON.stringify(this.get('inverse'));
  }.property('inverse'),
});
