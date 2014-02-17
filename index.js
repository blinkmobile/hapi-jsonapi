'use strict';

var inflect = require('i')();
var _ = require('underscore');
var internals = {};

exports.register = function (plugin, options, next) {
  plugin.dependency('hapi-bearer');
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
      if (request.params.id) {
        server.helpers.find(resource, request.params.id, function (doc) {
          reply(internals.serialize(resource, [doc], schema));
        });
      } else {
        server.helpers.findMany(resource, {}, function (docs) {
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
      server.helpers.insert(resource, internals.deserialize(resource, request.payload), function (docs) {
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
      server.helpers.update(resource, request.params.id, internals.deserialize(resource, request.payload), function (docs) {
        reply(internals.serialize(resource, docs, schema));
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
      server.helpers.remove(resource, request.params.id, function (docs) {
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
