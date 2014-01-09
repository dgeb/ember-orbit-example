export default Ember.Handlebars.makeBoundHelper(function(json) {
  return JSON.stringify(json);
});
