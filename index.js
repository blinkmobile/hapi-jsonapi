'use strict';

var inflect = require('i')();
var _ = require('underscore');
var internals = {};
var uuid = require('node-uuid');

exports.register = function (plugin, options, next) {
  plugin.dependency(['hapi-mongodb']);

  plugin.expose('get', internals.get);
  plugin.expose('post', internals.post);
  plugin.expose('put', internals.put);
  plugin.expose('patch', internals.patch);
  plugin.expose('delete', internals.delete);

  internals.types = plugin.hapi.types;
  internals.auth = options.auth || false;

  next();
};

internals.get = function (resource, schema) {
  return {
    auth: internals.auth,
    handler: function (request, reply) {
      var db = request.server.plugins['hapi-mongodb'].db;
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

internals.post = function (resource, schema) {
  return {
    auth: internals.auth,
    validate: internals.validate(resource, schema),
    handler: function (request, reply) {
      var db = request.server.plugins['hapi-mongodb'].db,
        doc = internals.deserialize(resource, request.payload);

      doc._id = uuid.v4();

      db.collection(resource).insert(doc, function (err, docs) {
        if (err) {
          throw err;
        }
        reply(internals.serialize(resource, docs, schema));
      });
    }
  };
};

internals.put = function (resource, schema) {
  return {
    auth: internals.auth,
    validate: internals.validate(resource, schema),
    handler: function (request, reply) {
      var db = request.server.plugins['hapi-mongodb'].db,
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

internals.patch = function (resource, schema) {
  return {
    auth: internals.auth,
    validate: internals.validate(resource, schema),
    handler: function (request, reply) {
      reply('Not yet implemented. Sorry!');
    }
  };
};

internals.delete = function (resource, schema) {
  return {
    auth: internals.auth,
    handler: function (request, reply) {
      var db = request.server.plugins['hapi-mongodb'].db;
      db.collection(resource).remove({_id: request.params.id}, function (err, docs) {
        if (err) {
          throw err;
        }
        reply(docs);
      });
    }
  };
};

internals.validate = function (resource, schema) {
  var validation = {payload: {}},
    resourceSchema = {},
    types = internals.types;

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
