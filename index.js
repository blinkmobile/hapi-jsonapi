'use strict';

var inflect = require('i')();
var _ = require('underscore');
var internals = {};

exports.register = function (plugin, options, next) {
  plugin.dependency(['hapi-bearer', 'hapi-db']);
  plugin.auth.strategy('bearer', 'bearer');

  plugin.expose('get', internals.get);
  plugin.expose('post', internals.post);
  plugin.expose('put', internals.put);
  plugin.expose('patch', internals.patch);
  plugin.expose('delete', internals.delete);

  next();
};

internals.get = function (resource, schema, server) {
  return {
    auth: 'bearer',
    handler: function (request, reply) {
      var db = request.server.plugins['hapi-db'].db;
      if (request.params.id) {
        db.collection(resource).findOne({_id: request.params.id}, function (err, doc) {
          if (err) {
            throw err;
          }
          reply(internals.serialize(resource, [doc], schema));
        });
      } else {
        db.collection(resource).find({}, function (err, docs) {
          if (err) {
            throw err;
          }
          reply(internals.serialize(resource, docs, schema));
        });
      }
    }
  };
};

internals.post = function (resource, schema, server, types) {
  return {
    auth: 'bearer',
    validate: internals.validate(resource, schema, types),
    handler: function (request, reply) {
      var db = request.server.plugins['hapi-db'].db;
      db.collection(resource).insert(internals.deserialize(resource, request.payload), function (err, docs) {
        if (err) {
          throw err;
        }
        reply(internals.serialize(resource, docs, schema));
      });
    }
  };
};

internals.put = function (resource, schema, server, types) {
  return {
    auth: 'bearer',
    validate: internals.validate(resource, schema, types),
    handler: function (request, reply) {
      var db = request.server.plugins['hapi-db'].db,
        filtered = {};
      _.each(internals.deserialize(resource, request.payload), function (value, key) {
        if (value) {
          filtered[key] = value;
        }
      });
      db.collection(resource).update({_id: request.params.id}, {
        $set: filtered
      }, function (err) {
        if (err) {
          throw err;
        }
        db.collection(resource).findOne({_id: request.params.id}, function (err, docs) {
          if (err) {
            throw err;
          }
          reply(internals.serialize(resource, docs, schema));
        });
      });
    }
  };
};

internals.patch = function (resource, schema, server, types) {
  return {
    auth: 'bearer',
    validate: internals.validate(resource, schema, types),
    handler: function (request, reply) {
      reply('Not yet implemented. Sorry!');
    }
  };
};

internals.delete = function (resource, schema, server) {
  return {
    auth: 'bearer',
    handler: function (request, reply) {
      var db = request.server.plugins['hapi-db'].db;
      db.collection(resource).remove({_id: request.params.id}, function (err, docs) {
        if (err) {
          throw err;
        }
        reply(docs);
      });
    }
  };
};

internals.validate = function (resource, schema, types) {
  var validation = {payload: {}},
    resourceSchema = {};

  _.each(schema, function (value, key) {
    if (typeof value === "string" ||
        (typeof value === "object" && value.ref) ||
        (value instanceof Array && value.length === 1 && value[0].ref)
        ) {
      if (!resourceSchema.links) {
        resourceSchema.links = {};
      }
      resourceSchema.links[key] = types.String();
    } else {
      resourceSchema[key] = value;
    }
  });

  validation.payload[inflect.pluralize(resource)] = types.Array().includes(types.Object(resourceSchema)).nullOk();

  return validation;
};

// Parses a resource and transforms it to be sent to clients
internals.serialize = function (resource, data, schema) {
  var json = {};

  json[inflect.pluralize(resource)] = [];

  if (!(data instanceof Array)) {
    data = [data];
  }

  data.map(function (record, index) {
    var sanitized = {
      id: record._id
    };
    _.each(schema, function (value, key) {
      if (typeof value === "string" ||
          (typeof value === "object" && value.ref) ||
          (value instanceof Array && value.length === 1 && value[0].ref)
          ) {
        if (!sanitized.links) {
          sanitized.links = {};
        }
        sanitized.links[key] = record[key];
      } else {
        sanitized[key] = record[key];
      }
    });
    json[inflect.pluralize(resource)].push(sanitized);
  });

  return json;
};

// Parses a resource and transforms it for the DB
internals.deserialize = function (resource, data) {
  var records = data[inflect.pluralize(resource)];

  records.map(function (item, index) {
    if (item.links) {
      _.each(item.links, function (value, key) {
        item[key] = value;
      });
      delete item.links;
    }
  });

  return records[0];
};
