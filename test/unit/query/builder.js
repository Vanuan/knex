/*global expect, describe, it*/

'use strict';

var MySQL_Client   = require('../../../lib/dialects/mysql')
var PG_Client      = require('../../../lib/dialects/postgres')
var Oracle_Client  = require('../../../lib/dialects/oracle')
var SQLite3_Client = require('../../../lib/dialects/sqlite3')
var MSSQL_Client   = require('../../../lib/dialects/mssql')
var Client         = require('../../../lib/client')

var clients = {
  mysql:    new MySQL_Client({}),
  postgres: new PG_Client({}),
  oracle:   new Oracle_Client({}),
  sqlite3:  new SQLite3_Client({}),
  mssql:  new MSSQL_Client({}),
  default:  new Client({})
}

var useNullAsDefaultConfig = { useNullAsDefault: true };
var clientsWithNullAsDefault = {
  mysql:    new MySQL_Client(useNullAsDefaultConfig),
  postgres: new PG_Client(useNullAsDefaultConfig),
  oracle:   new Oracle_Client(useNullAsDefaultConfig),
  sqlite3:  new SQLite3_Client(useNullAsDefaultConfig),
  mssql:  new MSSQL_Client(useNullAsDefaultConfig),
  default:  new Client(useNullAsDefaultConfig)
}

var valuesForUndefined = {
  mysql: clients.mysql.valueForUndefined,
  sqlite3: clients.sqlite3.valueForUndefined,
  oracle: clients.oracle.valueForUndefined,
  postgres: clients.postgres.valueForUndefined,
  mssql: clients.mssql.valueForUndefined,
  default: clients.default.valueForUndefined
};

function qb() {
  return clients.default.queryBuilder()
}

function raw(sql, bindings) {
  return clients.default.raw(sql, bindings)
}

function verifySqlResult(dialect, expectedObj, sqlObj) {
  Object.keys(expectedObj).forEach(function (key) {
    if (typeof expectedObj[key] === 'function') {
      expectedObj[key](sqlObj[key]);
    } else {
      try {
        expect(sqlObj[key]).to.deep.equal(expectedObj[key]);
      } catch (e) {
        e.stack = dialect + ': ' + e.stack
        throw e
      }
    }
  });
}

function testsql(chain, valuesToCheck, selectedClients) {
  selectedClients = selectedClients || clients;
  Object.keys(valuesToCheck).forEach(function(key) {
    var newChain = chain.clone()
        newChain.client = selectedClients[key]
    var sqlAndBindings = newChain.toSQL()

    var checkValue = valuesToCheck[key]
    if (typeof checkValue === 'string') {
      verifySqlResult(key, {sql: checkValue}, sqlAndBindings);
    } else {
      verifySqlResult(key, checkValue, sqlAndBindings);
    }
  })
}

function testquery(chain, valuesToCheck, selectedClients) {
  selectedClients = selectedClients || clients;
  Object.keys(valuesToCheck).forEach(function(key) {
    var newChain = chain.clone()
        newChain.client = selectedClients[key]
    var sqlString  = newChain.toQuery()
    var checkValue = valuesToCheck[key]
    expect(checkValue).to.equal(sqlString)
  })
}

describe("QueryBuilder", function() {

  it("query \\\\? escaping", function() {
    function createBuilder() {
      return qb().select('*').from('users').where('id', '=', 1)
        .whereRaw('?? \\? ?', ['jsonColumn', 'jsonKey\\?']);
    }

    // need to test each platform separately because QueryBuilder.clone does only shallow copy
    // and cached raw query strings are not re-evaluated when query builder client is changed
    testquery(createBuilder(), {
      mysql: 'select * from `users` where `id` = 1 and `jsonColumn` ? \'jsonKey?\''
    });

    testquery(createBuilder(), {
      default: 'select * from "users" where "id" = 1 and "jsonColumn" ? \'jsonKey?\''
    });
  });

  it("basic select", function() {
    testsql(qb().select('*').from('users'), {
      mysql: 'select * from `users`',
      mssql: 'select * from [users]',
      default: 'select * from "users"',
    });
  });

  it("adding selects", function() {
    testsql(qb().select('foo').select('bar').select(['baz', 'boom']).from('users'), {
      mysql: 'select `foo`, `bar`, `baz`, `boom` from `users`',
      mssql: 'select [foo], [bar], [baz], [boom] from [users]',
      default: 'select "foo", "bar", "baz", "boom" from "users"'
    });
  });

  it("basic select distinct", function() {
    testsql(qb().distinct().select('foo', 'bar').from('users'), {
      mysql: {sql: 'select distinct `foo`, `bar` from `users`'},
      mssql: {sql: 'select distinct [foo], [bar] from [users]'},
      default: {sql: 'select distinct "foo", "bar" from "users"'}
    });
  });

  it("basic alias", function() {
    testsql(qb().select('foo as bar').from('users'), {
      mysql: 'select `foo` as `bar` from `users`',
      oracle: 'select "foo" "bar" from "users"',
      mssql: 'select [foo] as [bar] from [users]',
      default: 'select "foo" as "bar" from "users"'
    });
  });

  it("basic alias trims spaces", function() {
    testsql(qb().select(' foo   as bar ').from('users'), {
      mysql: 'select `foo` as `bar` from `users`',
      oracle: 'select "foo" "bar" from "users"',
      mssql: 'select [foo] as [bar] from [users]',
      default: 'select "foo" as "bar" from "users"'
    });
  });

  it("allows for case-insensitive alias", function() {
    testsql(qb().select(' foo   aS bar ').from('users'), {
      mysql: 'select `foo` as `bar` from `users`',
      oracle: 'select "foo" "bar" from "users"',
      mssql: 'select [foo] as [bar] from [users]',
      default: 'select "foo" as "bar" from "users"'
    });
  });

  it("allows alias with dots in the identifier name", function() {
    testsql(qb().select('foo as bar.baz').from('users'), {
      mysql: 'select `foo` as `bar.baz` from `users`',
      oracle: 'select "foo" "bar.baz" from "users"',
      mssql: 'select [foo] as [bar.baz] from [users]',
      default: 'select "foo" as "bar.baz" from "users"'
    });
  });

  it("basic table wrapping", function() {
    testsql(qb().select('*').from('public.users'), {
      mysql: 'select * from `public`.`users`',
      mssql: 'select * from [public].[users]',
      default: 'select * from "public"."users"'
    });
  });

  it("basic table wrapping with declared schema", function() {
    testsql(qb().withSchema('myschema').select('*').from('users'), {
      mysql: 'select * from `myschema`.`users`',
      postgres: 'select * from "myschema"."users"',
      mssql: 'select * from [myschema].[users]',
      default: 'select * from "myschema"."users"'
    });
  });

  it("basic wheres", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1), {
      mysql: {
        sql: 'select * from `users` where `id` = ?',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ?',
        bindings: [1]
      },
      default: {
        sql: 'select * from "users" where "id" = ?',
        bindings: [1]
      }
    });

    testquery(qb().select('*').from('users').where('id', '=', 1), {
      mysql: 'select * from `users` where `id` = 1',
      postgres: 'select * from "users" where "id" = \'1\'',
      mssql: 'select * from [users] where [id] = 1',
      default: 'select * from "users" where "id" = 1'
    });
  });


  it("where not", function() {
    testsql(qb().select('*').from('users').whereNot('id', '=', 1), {
      mysql: {
        sql: 'select * from `users` where not `id` = ?',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [users] where not [id] = ?',
        bindings: [1]
      },
      default: {
        sql: 'select * from "users" where not "id" = ?',
        bindings: [1]
      }
    });

    testquery(qb().select('*').from('users').whereNot('id', '=', 1), {
      mysql: 'select * from `users` where not `id` = 1',
      postgres: 'select * from "users" where not "id" = \'1\'',
      mssql: 'select * from [users] where not [id] = 1',
      default: 'select * from "users" where not "id" = 1'
    });
  });

  it("grouped or where not", function() {
    testsql(qb().select('*').from('users').whereNot(function() { this.where('id', '=', 1).orWhereNot('id', '=', 3); }), {
      mysql: {
        sql: 'select * from `users` where not (`id` = ? or not `id` = ?)',
        bindings: [1, 3]
      },
      mssql: {
        sql: 'select * from [users] where not ([id] = ? or not [id] = ?)',
        bindings: [1, 3]
      },
      default: {
        sql: 'select * from "users" where not ("id" = ? or not "id" = ?)',
        bindings: [1, 3]
      }
    });

    testquery(qb().select('*').from('users').whereNot(function() { this.where('id', '=', 1).orWhereNot('id', '=', 3); }), {
      mysql: 'select * from `users` where not (`id` = 1 or not `id` = 3)',
      postgres: 'select * from "users" where not ("id" = \'1\' or not "id" = \'3\')',
      mssql: 'select * from [users] where not ([id] = 1 or not [id] = 3)',
      default: 'select * from "users" where not ("id" = 1 or not "id" = 3)'
    });
  });

  it("grouped or where not alternate", function() {
    testsql(qb().select('*').from('users').where(function() { this.where('id', '=', 1).orWhereNot('id', '=', 3); }), {
      mysql: {
        sql: 'select * from `users` where (`id` = ? or not `id` = ?)',
        bindings: [1, 3]
      },
      mssql: {
        sql: 'select * from [users] where ([id] = ? or not [id] = ?)',
        bindings: [1, 3]
      },
      default: {
        sql: 'select * from "users" where ("id" = ? or not "id" = ?)',
        bindings: [1, 3]
      }
    });

    testquery(qb().select('*').from('users').where(function() { this.where('id', '=', 1).orWhereNot('id', '=', 3); }), {
      mysql: 'select * from `users` where (`id` = 1 or not `id` = 3)',
      postgres: 'select * from "users" where ("id" = \'1\' or not "id" = \'3\')',
      mssql: 'select * from [users] where ([id] = 1 or not [id] = 3)',
      default: 'select * from "users" where ("id" = 1 or not "id" = 3)'
    });
  });


  it("where not object", function() {
    testsql(qb().select('*').from('users').whereNot({first_name: 'Test', last_name: 'User'}), {
      mysql: {
        sql: 'select * from `users` where not `first_name` = ? and not `last_name` = ?',
        bindings: ['Test', 'User']
      },
      mssql: {
        sql: 'select * from [users] where not [first_name] = ? and not [last_name] = ?',
        bindings: ['Test', 'User']
      },
      default: {
        sql: 'select * from "users" where not "first_name" = ? and not "last_name" = ?',
        bindings: ['Test', 'User']
      }
    });

    testquery(qb().select('*').from('users').whereNot({first_name: 'Test', last_name: 'User'}), {
      mysql: 'select * from `users` where not `first_name` = \'Test\' and not `last_name` = \'User\'',
      postgres: 'select * from "users" where not "first_name" = \'Test\' and not "last_name" = \'User\'',
      mssql: 'select * from [users] where not [first_name] = \'Test\' and not [last_name] = \'User\'',
      default: 'select * from "users" where not "first_name" = \'Test\' and not "last_name" = \'User\''
    });
  });


  it('where bool', function() {
    testquery(qb().select('*').from('users').where(true), {
      mysql: 'select * from `users` where 1 = 1',
      sqlite3: 'select * from "users" where 1 = 1',
      mssql: 'select * from [users] where 1 = 1',
      default: 'select * from "users" where 1 = 1'
    });
  });

  it("where betweens", function() {
    testsql(qb().select('*').from('users').whereBetween('id', [1, 2]), {
      mysql: {
        sql: 'select * from `users` where `id` between ? and ?',
        bindings: [1, 2]
      },
      mssql: {
        sql: 'select * from [users] where [id] between ? and ?',
        bindings: [1, 2]
      },
      default: {
        sql: 'select * from "users" where "id" between ? and ?',
        bindings: [1, 2]
      }
    });
  });

  it("and where betweens", function() {
    testsql(qb().select('*').from('users').where('name', '=', 'user1').andWhereBetween('id', [1, 2]), {
      mysql: {
        sql: 'select * from `users` where `name` = ? and `id` between ? and ?',
        bindings: ['user1', 1, 2]
      },
      mssql: {
        sql: 'select * from [users] where [name] = ? and [id] between ? and ?',
        bindings: ['user1', 1, 2]
      },
      default: {
        sql: 'select * from "users" where "name" = ? and "id" between ? and ?',
        bindings: ['user1', 1, 2]
      }
    });
  });

  it("and where not betweens", function() {
    testsql(qb().select('*').from('users').where('name', '=', 'user1').andWhereNotBetween('id', [1, 2]), {
      mysql: {
        sql: 'select * from `users` where `name` = ? and `id` not between ? and ?',
        bindings: ['user1', 1, 2]
      },
      mssql: {
        sql: 'select * from [users] where [name] = ? and [id] not between ? and ?',
        bindings: ['user1', 1, 2]
      },
      default: {
        sql: 'select * from "users" where "name" = ? and "id" not between ? and ?',
        bindings: ['user1', 1, 2]
      }
    });
  });

  it("where betweens, alternate", function() {
    testsql(qb().select('*').from('users').where('id', 'BeTween', [1, 2]), {
      mysql: {
        sql: 'select * from `users` where `id` between ? and ?',
        bindings: [1, 2]
      },
      mssql: {
        sql: 'select * from [users] where [id] between ? and ?',
        bindings: [1, 2]
      },
      default: {
        sql: 'select * from "users" where "id" between ? and ?',
        bindings: [1, 2]
      }
    });
  });

  it("where not between", function() {
    testsql(qb().select('*').from('users').whereNotBetween('id', [1, 2]), {
      mysql: {
        sql: 'select * from `users` where `id` not between ? and ?',
        bindings: [1, 2]
      },
      mssql: {
        sql: 'select * from [users] where [id] not between ? and ?',
        bindings: [1, 2]
      },
      default: {
        sql: 'select * from "users" where "id" not between ? and ?',
        bindings: [1, 2]
      }
    });
  });

  it("where not between, alternate", function() {
    testsql(qb().select('*').from('users').where('id', 'not between ', [1, 2]), {
      mysql: {
        sql: 'select * from `users` where `id` not between ? and ?',
        bindings: [1, 2]
      },
      mssql: {
        sql: 'select * from [users] where [id] not between ? and ?',
        bindings: [1, 2]
      },
      default: {
        sql: 'select * from "users" where "id" not between ? and ?',
        bindings: [1, 2]
      }
    });
  });

  it("basic or wheres", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).orWhere('email', '=', 'foo'), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or `email` = ?',
        bindings: [1, 'foo']
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or [email] = ?',
        bindings: [1, 'foo']
      },
      default: {
        sql: 'select * from "users" where "id" = ? or "email" = ?',
        bindings: [1, 'foo']
      }
    });
  });

  it("chained or wheres", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).or.where('email', '=', 'foo'), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or `email` = ?',
        bindings: [1, 'foo']
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or [email] = ?',
        bindings: [1, 'foo']
      },
      default: {
        sql: 'select * from "users" where "id" = ? or "email" = ?',
        bindings: [1, 'foo']
      }
    });
  });

  it("raw column wheres", function() {
    testsql(qb().select('*').from('users').where(raw('LCASE("name")'), 'foo'), {
      mysql: {
        sql: 'select * from `users` where LCASE("name") = ?',
        bindings: ['foo']
      },
      mssql: {
        sql: 'select * from [users] where LCASE("name") = ?',
        bindings: ['foo']
      },
      default: {
        sql: 'select * from "users" where LCASE("name") = ?',
        bindings: ['foo']
      }
    });
  });

  it("raw wheres", function() {
    testsql(qb().select('*').from('users').where(raw('id = ? or email = ?', [1, 'foo'])), {
      mysql: {
        sql: 'select * from `users` where id = ? or email = ?',
        bindings: [1, 'foo']
      },
      mssql: {
        sql: 'select * from [users] where id = ? or email = ?',
        bindings: [1, 'foo']
      },
      default: {
        sql: 'select * from "users" where id = ? or email = ?',
        bindings: [1, 'foo']
      }
    });
  });

  it("raw or wheres", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).orWhere(raw('email = ?', ['foo'])), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or email = ?',
        bindings: [1, 'foo']
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or email = ?',
        bindings: [1, 'foo']
      },
      default: {
        sql: 'select * from "users" where "id" = ? or email = ?',
        bindings: [1, 'foo']
      }
    });
  });

  it("chained raw or wheres", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).or.where(raw('email = ?', ['foo'])), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or email = ?',
        bindings: [1, 'foo']
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or email = ?',
        bindings: [1, 'foo']
      },
      default: {
        sql: 'select * from "users" where "id" = ? or email = ?',
        bindings: [1, 'foo']
      }
    });
  });

  it("basic where ins", function() {
    testsql(qb().select('*').from('users').whereIn('id', [1, 2, 3]), {
      mysql: {
        sql: 'select * from `users` where `id` in (?, ?, ?)',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] in (?, ?, ?)',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" in (?, ?, ?)',
        bindings: [1, 2, 3]
      }
    });
  });

  it("orWhereIn", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).orWhereIn('id', [1, 2, 3]), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or `id` in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or [id] in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? or "id" in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      }
    });
  });

  it("basic where not ins", function() {
    testsql(qb().select('*').from('users').whereNotIn('id', [1, 2, 3]), {
      mysql: {
        sql: 'select * from `users` where `id` not in (?, ?, ?)',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] not in (?, ?, ?)',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" not in (?, ?, ?)',
        bindings: [1, 2, 3]
      }
    });
  });

  it("chained or where not in", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).or.not.whereIn('id', [1, 2, 3]), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or `id` not in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or [id] not in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? or "id" not in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      }
    });
  });

  it("or.whereIn", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).or.whereIn('id', [4, 2, 3]), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or `id` in (?, ?, ?)',
        bindings: [1, 4, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or [id] in (?, ?, ?)',
        bindings: [1, 4, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? or "id" in (?, ?, ?)',
        bindings: [1, 4, 2, 3]
      }
    });
  });

  it("chained basic where not ins", function() {
    testsql(qb().select('*').from('users').not.whereIn('id', [1, 2, 3]), {
      mysql: {
        sql: 'select * from `users` where `id` not in (?, ?, ?)',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] not in (?, ?, ?)',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" not in (?, ?, ?)',
        bindings: [1, 2, 3]
      }
    });
  });

  it("chained or where not in", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).or.not.whereIn('id', [1, 2, 3]), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or `id` not in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or [id] not in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? or "id" not in (?, ?, ?)',
        bindings: [1, 1, 2, 3]
      }
    });
  });

  it('whereIn with empty array, #477', function() {
    testsql(qb().select('*').from('users').whereIn('id', []), {
      mysql: {
        sql: 'select * from `users` where 1 = ?',
        bindings: [0]
      },
      sqlite3: {
        sql: 'select * from "users" where 1 = ?',
        bindings: [0]
      },
      mssql: {
        sql: 'select * from [users] where 1 = ?',
        bindings: [0]
      },
      default: {
        sql: 'select * from "users" where 1 = ?',
        bindings: [0]
      }
    });
  });

  it('whereNotIn with empty array, #477', function() {
    testsql(qb().select('*').from('users').whereNotIn('id', []), {
      mysql: {
        sql: 'select * from `users` where 1 = ?',
        bindings: [1]
      },
      sqlite3: {
        sql: 'select * from "users" where 1 = ?',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [users] where 1 = ?',
        bindings: [1]
      },
      default: {
        sql: 'select * from "users" where 1 = ?',
        bindings: [1]
      }
    });
  });

  it('should allow a function as the first argument, for a grouped where clause', function() {
    var partial = qb().table('test').where('id', '=', 1);
    testsql(partial, {
      mysql: 'select * from `test` where `id` = ?',
      mssql: 'select * from [test] where [id] = ?',
      default: 'select * from "test" where "id" = ?'
    });

    var subWhere = function (sql) {
      expect(this).to.equal(sql);
      this.where({id: 3}).orWhere('id', 4);
    };

    testsql(partial.where(subWhere), {
      mysql: {
        sql: 'select * from `test` where `id` = ? and (`id` = ? or `id` = ?)',
        bindings: [1, 3, 4]
      },
      mssql: {
        sql: 'select * from [test] where [id] = ? and ([id] = ? or [id] = ?)',
        bindings: [1, 3, 4]
      },
      default: {
        sql: 'select * from "test" where "id" = ? and ("id" = ? or "id" = ?)',
        bindings: [1, 3, 4]
      }
    });
  });

  it('should accept a function as the "value", for a sub select', function() {
    var chain = qb().where('id', '=', function(qb) {
      expect(this).to.equal(qb);
      this.select('account_id').from('names').where('names.id', '>', 1).orWhere(function() {
        this.where('names.first_name', 'like', 'Tim%').andWhere('names.id', '>', 10);
      });
    });

    testsql(chain, {
      mysql: {
        sql: 'select * where `id` = (select `account_id` from `names` where `names`.`id` > ? or (`names`.`first_name` like ? and `names`.`id` > ?))',
        bindings: [1, 'Tim%', 10]
      },
      mssql: {
        sql: 'select * where [id] = (select [account_id] from [names] where [names].[id] > ? or ([names].[first_name] like ? and [names].[id] > ?))',
        bindings: [1, 'Tim%', 10]
      },
      default: {
        sql: 'select * where "id" = (select "account_id" from "names" where "names"."id" > ? or ("names"."first_name" like ? and "names"."id" > ?))',
        bindings: [1, 'Tim%', 10]
      }
    });

    testquery(chain, {
      mysql: 'select * where `id` = (select `account_id` from `names` where `names`.`id` > 1 or (`names`.`first_name` like \'Tim%\' and `names`.`id` > 10))',
      postgres: 'select * where "id" = (select "account_id" from "names" where "names"."id" > \'1\' or ("names"."first_name" like \'Tim%\' and "names"."id" > \'10\'))',
      mssql: 'select * where [id] = (select [account_id] from [names] where [names].[id] > 1 or ([names].[first_name] like \'Tim%\' and [names].[id] > 10))',
      default: 'select * where "id" = (select "account_id" from "names" where "names"."id" > 1 or ("names"."first_name" like \'Tim%\' and "names"."id" > 10))'
    });
  });

  it('should accept a function as the "value", for a sub select when chained', function() {
    var chain = qb().where('id', '=', function(qb) {
      expect(this).to.equal(qb);
      this.select('account_id').from('names').where('names.id', '>', 1).or.where(function() {
        this.where('names.first_name', 'like', 'Tim%').and.where('names.id', '>', 10);
      });
    });

    testsql(chain, {
      mysql: {
        sql: 'select * where `id` = (select `account_id` from `names` where `names`.`id` > ? or (`names`.`first_name` like ? and `names`.`id` > ?))',
        bindings: [1, 'Tim%', 10]
      },
      mssql: {
        sql: 'select * where [id] = (select [account_id] from [names] where [names].[id] > ? or ([names].[first_name] like ? and [names].[id] > ?))',
        bindings: [1, 'Tim%', 10]
      },
      default: {
        sql: 'select * where "id" = (select "account_id" from "names" where "names"."id" > ? or ("names"."first_name" like ? and "names"."id" > ?))',
        bindings: [1, 'Tim%', 10]
      }
    });
  });

  it('should not do whereNull on where("foo", "<>", null) #76', function() {
    testquery(qb().where('foo', '<>', null), {
      mysql: 'select * where `foo` <> NULL',
      mssql: 'select * where [foo] <> NULL',
      default: 'select * where "foo" <> NULL'
    });
  });

  it('should expand where("foo", "!=") to - where id = "!="', function() {
    testquery(qb().where('foo', '!='), {
      mysql: 'select * where `foo` = \'!=\'',
      mssql: 'select * where [foo] = \'!=\'',
      default: 'select * where "foo" = \'!=\''
    });
  });

  it("unions", function() {
    var chain = qb().select('*').from('users').where('id', '=', 1).union(function() {
      this.select('*').from('users').where('id', '=', 2);
    });
    testsql(chain, {
      mysql: {
        sql: 'select * from `users` where `id` = ? union select * from `users` where `id` = ?',
        bindings: [1, 2]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? union select * from [users] where [id] = ?',
        bindings: [1, 2]
      },
      default: {
        sql: 'select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2]
      }
    });

    var multipleArgumentsChain = qb().select('*').from('users').where({id: 1}).union(function() {
      this.select('*').from('users').where({id: 2});
    }, function() {
      this.select('*').from('users').where({id: 3});
    });
    testsql(multipleArgumentsChain, {
      mysql: {
        sql: 'select * from `users` where `id` = ? union select * from `users` where `id` = ? union select * from `users` where `id` = ?',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? union select * from [users] where [id] = ? union select * from [users] where [id] = ?',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3]
      }
    });

    var arrayChain = qb().select('*').from('users').where({id: 1}).union([
      function() {
        this.select('*').from('users').where({id: 2});
      }, function() {
        this.select('*').from('users').where({id: 3});
      }
    ]);
    testsql(arrayChain, {
      mysql: {
        sql: 'select * from `users` where `id` = ? union select * from `users` where `id` = ? union select * from `users` where `id` = ?',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? union select * from [users] where [id] = ? union select * from [users] where [id] = ?',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3]
      }
    });
  });

  it("wraps unions", function() {
    var wrappedChain = qb().select('*').from('users').where('id', 'in', function() {
      this.table('users').max("id").union(function() {
        this.table('users').min("id");
      }, true);
    });
    testsql(wrappedChain, {
      mysql: {
        sql: 'select * from `users` where `id` in (select max(`id`) from `users` union (select min(`id`) from `users`))',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] where [id] in (select max([id]) from [users] union (select min([id]) from [users]))',
        bindings: []
      },
      default: {
        sql: 'select * from "users" where "id" in (select max("id") from "users" union (select min("id") from "users"))',
        bindings: []
      }
    });

    // worthwhile since we're playing games with the 'wrap' specification with arguments
    var multipleArgumentsWrappedChain = qb().select('*').from('users').where({id: 1}).union(function() {
      this.select('*').from('users').where({id: 2});
    }, function() {
      this.select('*').from('users').where({id: 3});
    }, true);
    testsql(multipleArgumentsWrappedChain, {
      mysql: {
        sql: 'select * from `users` where `id` = ? union (select * from `users` where `id` = ?) union (select * from `users` where `id` = ?)',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? union (select * from [users] where [id] = ?) union (select * from [users] where [id] = ?)',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? union (select * from "users" where "id" = ?) union (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3]
      }
    });

    var arrayWrappedChain = qb().select('*').from('users').where({id: 1}).union([
      function() {
        this.select('*').from('users').where({id: 2});
      }, function() {
        this.select('*').from('users').where({id: 3});
      }
    ], true);
    testsql(arrayWrappedChain, {
      mysql: {
        sql: 'select * from `users` where `id` = ? union (select * from `users` where `id` = ?) union (select * from `users` where `id` = ?)',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? union (select * from [users] where [id] = ?) union (select * from [users] where [id] = ?)',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? union (select * from "users" where "id" = ?) union (select * from "users" where "id" = ?)',
        bindings: [1, 2, 3]
      }
    });
  });

  // it("handles grouped mysql unions", function() {
  //   chain = myqb().union(
  //     raw(myqb().select('*').from('users').where('id', '=', 1)).wrap('(', ')'),
  //     raw(myqb().select('*').from('users').where('id', '=', 2)).wrap('(', ')')
  //   ).orderBy('id').limit(10).toSQL();
  //   expect(chain.sql).to.equal('(select * from `users` where `id` = ?) union (select * from `users` where `id` = ?) order by `id` asc limit ?');
  //   expect(chain.bindings).to.eql([1, 2, 10]);
  // });

  it("union alls", function() {
    var chain = qb().select('*').from('users').where('id', '=', 1).unionAll(function() {
      this.select('*').from('users').where('id', '=', 2);
    });
    testsql(chain, {
      mysql: {
        sql: 'select * from `users` where `id` = ? union all select * from `users` where `id` = ?',
        bindings: [1, 2]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? union all select * from [users] where [id] = ?',
        bindings: [1, 2]
      },
      default: {
        sql: 'select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2]
      }
    });
  });

  it("multiple unions", function() {
    var chain = qb().select('*').from('users').where('id', '=', 1)
      .union(qb().select('*').from('users').where('id', '=', 2))
      .union(qb().select('*').from('users').where('id', '=', 3));
    testsql(chain, {
      mysql: {
        sql: 'select * from `users` where `id` = ? union select * from `users` where `id` = ? union select * from `users` where `id` = ?',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? union select * from [users] where [id] = ? union select * from [users] where [id] = ?',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? union select * from "users" where "id" = ? union select * from "users" where "id" = ?',
        bindings: [1, 2, 3]
      }
    });
  });

  it("multiple union alls", function() {
    var chain = qb().select('*').from('users').where('id', '=', 1)
      .unionAll(qb().select('*').from('users').where('id', '=', 2))
      .unionAll(qb().select('*').from('users').where('id', '=', 3));

    testsql(chain, {
      mysql: {
        sql: 'select * from `users` where `id` = ? union all select * from `users` where `id` = ? union all select * from `users` where `id` = ?',
        bindings: [1, 2, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? union all select * from [users] where [id] = ? union all select * from [users] where [id] = ?',
        bindings: [1, 2, 3]
      },
      default: {
        sql: 'select * from "users" where "id" = ? union all select * from "users" where "id" = ? union all select * from "users" where "id" = ?',
        bindings: [1, 2, 3]
      }
    });
  });

  it("sub select where ins", function() {
    testsql(qb().select('*').from('users').whereIn('id', function(qb) {
      qb.select('id').from('users').where('age', '>', 25).limit(3);
    }), {
      mysql: {
        sql: 'select * from `users` where `id` in (select `id` from `users` where `age` > ? limit ?)',
        bindings: [25, 3]
      },
      oracle: {
        sql: 'select * from "users" where "id" in (select * from (select "id" from "users" where "age" > ?) where rownum <= ?)',
        bindings: [25, 3]
      },
      mssql: {
        sql: 'select * from [users] where [id] in (select top (?) [id] from [users] where [age] > ?)',
        bindings: [3, 25]
      },
      default: {
        sql: 'select * from "users" where "id" in (select "id" from "users" where "age" > ? limit ?)',
        bindings: [25, 3]
      }
    });
  });

  it("sub select where not ins", function() {
    testsql(qb().select('*').from('users').whereNotIn('id', function(qb) {
      qb.select('id').from('users').where('age', '>', 25);
    }), {
      mysql: {
        sql: 'select * from `users` where `id` not in (select `id` from `users` where `age` > ?)',
        bindings: [25]
      },
      mssql: {
        sql: 'select * from [users] where [id] not in (select [id] from [users] where [age] > ?)',
        bindings: [25]
      },
      default: {
        sql: 'select * from "users" where "id" not in (select "id" from "users" where "age" > ?)',
        bindings: [25]
      }
    });
  });

  it("basic where nulls", function() {
    testsql(qb().select('*').from('users').whereNull('id'), {
      mysql: {
        sql: 'select * from `users` where `id` is null',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] where [id] is null',
        bindings: []
      },
      default: {
        sql: 'select * from "users" where "id" is null',
        bindings: []
      }
    });
  });

  it("basic or where nulls", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).orWhereNull('id'), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or `id` is null',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or [id] is null',
        bindings: [1]
      },
      default: {
        sql: 'select * from "users" where "id" = ? or "id" is null',
        bindings: [1]
      }
    });
  });

  it("basic where not nulls", function() {
    testsql(qb().select('*').from('users').whereNotNull('id'), {
      mysql: {
        sql: 'select * from `users` where `id` is not null',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] where [id] is not null',
        bindings: []
      },
      default: {
        sql: 'select * from "users" where "id" is not null',
        bindings: []
      }
    });
  });

  it("basic or where not nulls", function() {
    testsql(qb().select('*').from('users').where('id', '>', 1).orWhereNotNull('id'), {
      mysql: {
        sql: 'select * from `users` where `id` > ? or `id` is not null',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [users] where [id] > ? or [id] is not null',
        bindings: [1]
      },
      default: {
        sql: 'select * from "users" where "id" > ? or "id" is not null',
        bindings: [1]
      }
    });
  });

  it("group bys", function() {
    testsql(qb().select('*').from('users').groupBy('id', 'email'), {
      mysql: {
        sql: 'select * from `users` group by `id`, `email`',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] group by [id], [email]',
        bindings: []
      },
      default: {
        sql: 'select * from "users" group by "id", "email"',
        bindings: []
      }
    });
  });

  it("order bys", function() {
    testsql(qb().select('*').from('users').orderBy('email').orderBy('age', 'desc'), {
      mysql: {
        sql: 'select * from `users` order by `email` asc, `age` desc',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] order by [email] asc, [age] desc',
        bindings: []
      },
      default: {
        sql: 'select * from "users" order by "email" asc, "age" desc',
        bindings: []
      }
    });
  });

  it("raw group bys", function() {
    testsql(qb().select('*').from('users').groupByRaw('id, email'), {
      mysql: {
        sql: 'select * from `users` group by id, email',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] group by id, email',
        bindings: []
      },
      default: {
        sql: 'select * from "users" group by id, email',
        bindings: []
      }
    });
  });

  it("raw order bys with default direction", function() {
    testsql(qb().select('*').from('users').orderBy(raw('col NULLS LAST')), {
      mysql: {
        sql: 'select * from `users` order by col NULLS LAST asc',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] order by col NULLS LAST asc',
        bindings: []
      },
      default: {
        sql: 'select * from "users" order by col NULLS LAST asc',
        bindings: []
      }
    });
  });

  it("raw order bys with specified direction", function() {
    testsql(qb().select('*').from('users').orderBy(raw('col NULLS LAST'), 'desc'), {
      mysql: {
        sql: 'select * from `users` order by col NULLS LAST desc',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] order by col NULLS LAST desc',
        bindings: []
      },
      default: {
        sql: 'select * from "users" order by col NULLS LAST desc',
        bindings: []
      }
    });
  });

  it("orderByRaw", function() {
    testsql(qb().select('*').from('users').orderByRaw('col NULLS LAST DESC'), {
      mysql: {
        sql: 'select * from `users` order by col NULLS LAST DESC',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] order by col NULLS LAST DESC',
        bindings: []
      },
      default: {
        sql: 'select * from "users" order by col NULLS LAST DESC',
        bindings: []
      }
    });
  });

  it("orderByRaw second argument is the binding", function() {
    testsql(qb().select('*').from('users').orderByRaw('col NULLS LAST ?', 'dEsc'), {
      mysql: {
        sql: 'select * from `users` order by col NULLS LAST ?',
        bindings: ['dEsc']
      },
      mssql: {
        sql: 'select * from [users] order by col NULLS LAST ?',
        bindings: ['dEsc']
      },
      default: {
        sql: 'select * from "users" order by col NULLS LAST ?',
        bindings: ['dEsc']
      }
    });
  });

  it("multiple order bys", function() {
    testsql(qb().select('*').from('users').orderBy('email').orderBy('age', 'desc'), {
      mysql: {
        sql: 'select * from `users` order by `email` asc, `age` desc',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] order by [email] asc, [age] desc',
        bindings: []
      },
      default: {
        sql: 'select * from "users" order by "email" asc, "age" desc',
        bindings: []
      }
    });
  });

  it("havings", function() {
    testsql(qb().select('*').from('users').having('email', '>', 1), {
      mysql: 'select * from `users` having `email` > ?',
      mssql: 'select * from [users] having [email] > ?',
      default: 'select * from "users" having "email" > ?'
    });
  });

  it("nested having", function() {
    testsql(qb().select('*').from('users').having(function(){
      this.where('email', '>', 1);
    }), {
      mysql: 'select * from `users` having (`email` > ?)',
      mssql: 'select * from [users] having ([email] > ?)',
      default: 'select * from "users" having ("email" > ?)'
    });
  });

  it("nested or havings", function() {
    testsql(qb().select('*').from('users').having(function(){
      this.where('email', '>', 10);
      this.orWhere('email', '=', 7);
    }), {
      mysql: 'select * from `users` having (`email` > ? or `email` = ?)',
      mssql: 'select * from [users] having ([email] > ? or [email] = ?)',
      default: 'select * from "users" having ("email" > ? or "email" = ?)'
    });
  });

  it("grouped having", function() {
    testsql(qb().select('*').from('users').groupBy('email').having('email', '>', 1), {
      mysql: 'select * from `users` group by `email` having `email` > ?',
      mssql: 'select * from [users] group by [email] having [email] > ?',
      default: 'select * from "users" group by "email" having "email" > ?'
    });
  });

  it("having from", function() {
    testsql(qb().select('email as foo_email').from('users').having('foo_email', '>', 1), {
      mysql: 'select `email` as `foo_email` from `users` having `foo_email` > ?',
      oracle: 'select "email" "foo_email" from "users" having "foo_email" > ?',
      mssql: 'select [email] as [foo_email] from [users] having [foo_email] > ?',
      default: 'select "email" as "foo_email" from "users" having "foo_email" > ?'
    });
  });

  it("raw havings", function() {
    testsql(qb().select('*').from('users').having(raw('user_foo < user_bar')), {
      mysql: 'select * from `users` having user_foo < user_bar',
      mssql: 'select * from [users] having user_foo < user_bar',
      default: 'select * from "users" having user_foo < user_bar'
    });
  });

  it("raw or havings", function() {
    testsql(qb().select('*').from('users').having('baz', '=', 1).orHaving(raw('user_foo < user_bar')), {
      mysql: 'select * from `users` having `baz` = ? or user_foo < user_bar',
      mssql: 'select * from [users] having [baz] = ? or user_foo < user_bar',
      default: 'select * from "users" having "baz" = ? or user_foo < user_bar'
    });
  });

  it("limits", function() {
    testsql(qb().select('*').from('users').limit(10), {
      mysql: {
        sql: 'select * from `users` limit ?',
        bindings: [10]
      },
      oracle: {
        sql: 'select * from (select * from "users") where rownum <= ?',
        bindings: [10]
      },
      mssql: {
        sql: 'select top (?) * from [users]',
        bindings: [10]
      },
      default: {
        sql: 'select * from "users" limit ?',
        bindings: [10]
      }
    });
  });

  it("can limit 0", function() {
    testsql(qb().select('*').from('users').limit(0), {
      mysql: {
        sql: 'select * from `users` limit ?',
        bindings: [0]
      },
      oracle: {
        sql: 'select * from (select * from "users") where rownum <= ?',
        bindings: [0]
      },
      mssql: {
        sql: 'select top (?) * from [users]',
        bindings: [0]
      },
      default: {
        sql: 'select * from "users" limit ?',
        bindings: [0]
      }
    });
  });

  it("limits and offsets", function() {
    testsql(qb().select('*').from('users').offset(5).limit(10), {
      mysql: {
        sql: 'select * from `users` limit ? offset ?',
        bindings: [10, 5]
      },
      oracle: {
        sql: 'select * from (select row_.*, ROWNUM rownum_ from (select * from "users") row_ where rownum <= ?) where rownum_ > ?',
        bindings: [15, 5]
      },
      mssql: {
        sql: 'select * from [users] offset ? rows fetch next ? rows only',
        bindings: [5, 10]
      },
      default: {
        sql: 'select * from "users" limit ? offset ?',
        bindings: [10, 5]
      }
    });
  });

  it("first", function() {
    testsql(qb().first('*').from('users'), {
      mysql: {
        sql: 'select * from `users` limit ?',
        bindings: [1]
      },
      oracle: {
        sql: 'select * from (select * from "users") where rownum <= ?',
        bindings: [1]
      },
      mssql: {
        sql: 'select top (?) * from [users]',
        bindings: [1]
      },
      default: {
        sql: 'select * from "users" limit ?',
        bindings: [1]
      }
    });
  });

  it("offsets only", function() {
    testsql(qb().select('*').from('users').offset(5), {
      mysql: {
        sql: 'select * from `users` limit 18446744073709551615 offset ?',
        bindings: [5]
      },
      sqlite3: {
        sql: 'select * from "users" limit ? offset ?',
        bindings: [-1, 5]
      },
      postgres: {
        sql: 'select * from "users" offset ?',
        bindings: ['5']
      },
      oracle: {
        sql: 'select * from (select row_.*, ROWNUM rownum_ from (select * from "users") row_ where rownum <= ?) where rownum_ > ?',
        bindings: [10000000000005, 5]
      },
      mssql: {
        sql: 'select * from [users] offset ? rows',
        bindings: [5]
      },
      default: {
        sql: 'select * from "users" offset ?',
        bindings: [5]
      }
    });
  });

  it("where shortcut", function() {
    testsql(qb().select('*').from('users').where('id', 1).orWhere('name', 'foo'), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or `name` = ?',
        bindings: [1, 'foo']
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or [name] = ?',
        bindings: [1, 'foo']
      },
      default: {
        sql: 'select * from "users" where "id" = ? or "name" = ?',
        bindings: [1, 'foo']
      }
    });
  });

  it("nested wheres", function() {
    testsql(qb().select('*').from('users').where('email', '=', 'foo').orWhere(function(qb) {
      qb.where('name', '=', 'bar').where('age', '=', 25);
    }), {
      mysql: {
        sql: 'select * from `users` where `email` = ? or (`name` = ? and `age` = ?)',
        bindings: ['foo', 'bar', 25]
      },
      mssql: {
        sql: 'select * from [users] where [email] = ? or ([name] = ? and [age] = ?)',
        bindings: ['foo', 'bar', 25]
      },
      default: {
        sql: 'select * from "users" where "email" = ? or ("name" = ? and "age" = ?)',
        bindings: ['foo', 'bar', 25]
      }
    });
  });

  it("full sub selects", function() {
    testsql(qb().select('*').from('users').where('email', '=', 'foo').orWhere('id', '=', function(qb) {
      qb.select(raw('max(id)')).from('users').where('email', '=', 'bar');
    }), {
      mysql: {
        sql: 'select * from `users` where `email` = ? or `id` = (select max(id) from `users` where `email` = ?)',
        bindings: ['foo', 'bar']
      },
      mssql: {
        sql: 'select * from [users] where [email] = ? or [id] = (select max(id) from [users] where [email] = ?)',
        bindings: ['foo', 'bar']
      },
      default: {
        sql: 'select * from "users" where "email" = ? or "id" = (select max(id) from "users" where "email" = ?)',
        bindings: ['foo', 'bar']
      }
    });
  });

  it("where exists", function() {
    testsql(qb().select('*').from('orders').whereExists(function(qb) {
      qb.select('*').from('products').where('products.id', '=', raw('"orders"."id"'));
    }), {
      mysql: {
        sql: 'select * from `orders` where exists (select * from `products` where `products`.`id` = "orders"."id")',
        bindings: []
      },
      mssql: {
        sql: 'select * from [orders] where exists (select * from [products] where [products].[id] = "orders"."id")',
        bindings: []
      },
      default: {
        sql: 'select * from "orders" where exists (select * from "products" where "products"."id" = "orders"."id")',
        bindings: []
      }
    });
  });

  it("where exists with builder", function() {
    testsql(qb().select('*').from('orders').whereExists(qb().select('*').from('products').whereRaw('products.id = orders.id')), {
      mysql: {
        sql: 'select * from `orders` where exists (select * from `products` where products.id = orders.id)',
        bindings: []
      },
      mssql: {
        sql: 'select * from [orders] where exists (select * from [products] where products.id = orders.id)',
        bindings: []
      },
      default: {
        sql: 'select * from "orders" where exists (select * from "products" where products.id = orders.id)',
        bindings: []
      }
    });
  });

  it("where not exists", function() {
    testsql(qb().select('*').from('orders').whereNotExists(function(qb) {
      qb.select('*').from('products').where('products.id', '=', raw('"orders"."id"'));
    }), {
      mysql: {
        sql: 'select * from `orders` where not exists (select * from `products` where `products`.`id` = "orders"."id")',
        bindings: []
      },
      mssql: {
        sql: 'select * from [orders] where not exists (select * from [products] where [products].[id] = "orders"."id")',
        bindings: []
      },
      default: {
        sql: 'select * from "orders" where not exists (select * from "products" where "products"."id" = "orders"."id")',
        bindings: []
      }
    });
  });

  it("or where exists", function() {
    testsql(qb().select('*').from('orders').where('id', '=', 1).orWhereExists(function(qb) {
      qb.select('*').from('products').where('products.id', '=', raw('"orders"."id"'));
    }), {
      mysql: {
        sql: 'select * from `orders` where `id` = ? or exists (select * from `products` where `products`.`id` = "orders"."id")',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [orders] where [id] = ? or exists (select * from [products] where [products].[id] = "orders"."id")',
        bindings: [1]
      },
      default: {
        sql: 'select * from "orders" where "id" = ? or exists (select * from "products" where "products"."id" = "orders"."id")',
        bindings: [1]
      }
    });
  });

  it("or where not exists", function() {
    testsql(qb().select('*').from('orders').where('id', '=', 1).orWhereNotExists(function(qb) {
      qb.select('*').from('products').where('products.id', '=', raw('"orders"."id"'));
    }), {
      mysql: {
        sql: 'select * from `orders` where `id` = ? or not exists (select * from `products` where `products`.`id` = "orders"."id")',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [orders] where [id] = ? or not exists (select * from [products] where [products].[id] = "orders"."id")',
        bindings: [1]
      },
      default: {
        sql: 'select * from "orders" where "id" = ? or not exists (select * from "products" where "products"."id" = "orders"."id")',
        bindings: [1]
      }
    });
  });

  it("basic joins", function() {
    testsql(qb().select('*').from('users').join('contacts', 'users.id', '=', 'contacts.id').leftJoin('photos', 'users.id', '=', 'photos.id'), {
      mysql: {
        sql: 'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` left join `photos` on `users`.`id` = `photos`.`id`',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] left join [photos] on [users].[id] = [photos].[id]',
        bindings: []
      },
      default: {
        sql: 'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" left join "photos" on "users"."id" = "photos"."id"',
        bindings: []
      }
    });
  });

  it("complex join", function() {
    testsql(qb().select('*').from('users').join('contacts', function(qb) {
      qb.on('users.id', '=', 'contacts.id').orOn('users.name', '=', 'contacts.name');
    }), {
      mysql: {
        sql: 'select * from `users` inner join `contacts` on `users`.`id` = `contacts`.`id` or `users`.`name` = `contacts`.`name`',
        bindings: []
      },
      mssql: {
        sql: 'select * from [users] inner join [contacts] on [users].[id] = [contacts].[id] or [users].[name] = [contacts].[name]',
        bindings: []
      },
      default: {
        sql: 'select * from "users" inner join "contacts" on "users"."id" = "contacts"."id" or "users"."name" = "contacts"."name"',
        bindings: []
      }
    });
  });

  it("joins with raw", function() {
    testsql(qb().select('*').from('users').join('contacts', 'users.id', raw(1)).leftJoin('photos', 'photos.title', '=', raw('?', ['My Photo'])), {
      mysql: {
        sql: 'select * from `users` inner join `contacts` on `users`.`id` = 1 left join `photos` on `photos`.`title` = ?',
        bindings: ['My Photo']
      },
      mssql: {
        sql: 'select * from [users] inner join [contacts] on [users].[id] = 1 left join [photos] on [photos].[title] = ?',
        bindings: ['My Photo']
      },
      default: {
        sql: 'select * from "users" inner join "contacts" on "users"."id" = 1 left join "photos" on "photos"."title" = ?',
        bindings: ['My Photo']
      }
    });
  });

  it("joins with schema", function() {
    testsql(qb().withSchema('myschema').select('*').from('users').join('contacts', 'users.id', '=', 'contacts.id').leftJoin('photos', 'users.id', '=', 'photos.id'), {
      mysql: {
        sql: 'select * from `myschema`.`users` inner join `myschema`.`contacts` on `users`.`id` = `contacts`.`id` left join `myschema`.`photos` on `users`.`id` = `photos`.`id`',
        bindings: []
      },
      mssql: {
        sql: 'select * from [myschema].[users] inner join [myschema].[contacts] on [users].[id] = [contacts].[id] left join [myschema].[photos] on [users].[id] = [photos].[id]',
        bindings: []
      },
      default: {
        sql: 'select * from "myschema"."users" inner join "myschema"."contacts" on "users"."id" = "contacts"."id" left join "myschema"."photos" on "users"."id" = "photos"."id"',
        bindings: []
      }
    });
  });
  it("raw expressions in select", function() {
    testsql(qb().select(raw('substr(foo, 6)')).from('users'), {
      mysql: {
        sql: 'select substr(foo, 6) from `users`',
        bindings: []
      },
      mssql: {
        sql: 'select substr(foo, 6) from [users]',
        bindings: []
      },
      default: {
        sql: 'select substr(foo, 6) from "users"',
        bindings: []
      }
    });
  });

  it("count", function() {
    testsql(qb().from('users').count(), {
      mysql: {
        sql: 'select count(*) from `users`',
        bindings: []
      },
      mssql: {
        sql: 'select count(*) from [users]',
        bindings: []
      },
      default: {
        sql: 'select count(*) from "users"',
        bindings: []
      }
    });
  });

  it("count distinct", function() {
    testsql(qb().from('users').countDistinct(), {
      mysql: {
        sql: 'select count(distinct *) from `users`',
        bindings: []
      },
      mssql: {
        sql: 'select count(distinct *) from [users]',
        bindings: []
      },
      default: {
        sql: 'select count(distinct *) from "users"',
        bindings: []
      }
    });
  });

  it("count with alias", function() {
    testsql(qb().from('users').count('* as all'), {
      mysql: {
        sql: 'select count(*) as `all` from `users`',
        bindings: []
      },
      mssql: {
        sql: 'select count(*) as [all] from [users]',
        bindings: []
      },
      oracle: {
        sql: 'select count(*) "all" from "users"',
        bindings: []
      },
      default: {
        sql: 'select count(*) as "all" from "users"',
        bindings: []
      }
    });
  });

  it("count distinct with alias", function() {
    testsql(qb().from('users').countDistinct('* as all'), {
      mysql: {
        sql: 'select count(distinct *) as `all` from `users`',
        bindings: []
      },
      oracle: {
        sql: 'select count(distinct *) "all" from "users"',
        bindings: []
      },
      mssql: {
        sql: 'select count(distinct *) as [all] from [users]',
        bindings: []
      },
      default: {
        sql: 'select count(distinct *) as "all" from "users"',
        bindings: []
      }
    });
  });

  it("max", function() {
    testsql(qb().from('users').max('id'), {
      mysql: {
        sql: 'select max(`id`) from `users`',
        bindings: []
      },
      mssql: {
        sql: 'select max([id]) from [users]',
        bindings: []
      },
      default: {
        sql: 'select max("id") from "users"',
        bindings: []
      }
    });
  });

  it("min", function() {
    testsql(qb().from('users').max('id'), {
      mysql: {
        sql: 'select max(`id`) from `users`',
        bindings: []
      },
      mssql: {
        sql: 'select max([id]) from [users]',
        bindings: []
      },
      default: {
        sql: 'select max("id") from "users"',
        bindings: []
      }
    });
  });

  it("sum", function() {
    testsql(qb().from('users').sum('id'), {
      mysql: {
        sql: 'select sum(`id`) from `users`',
        bindings: []
      },
      mssql: {
        sql: 'select sum([id]) from [users]',
        bindings: []
      },
      default: {
        sql: 'select sum("id") from "users"',
        bindings: []
      }
    });
  });

  it("sum distinct", function() {
    testsql(qb().from('users').sumDistinct('id'), {
      mysql: {
        sql: 'select sum(distinct `id`) from `users`',
        bindings: []
      },
      mssql: {
        sql: 'select sum(distinct [id]) from [users]',
        bindings: []
      },
      default: {
        sql: 'select sum(distinct "id") from "users"',
        bindings: []
      }
    });
  });

  it("insert method", function() {
    testsql(qb().into('users').insert({'email': 'foo'}), {
      mysql: {
        sql: 'insert into `users` (`email`) values (?)',
        bindings: ['foo']
      },
      mssql: {
        sql: 'insert into [users] ([email]) values (?)',
        bindings: ['foo']
      },
      default: {
        sql: 'insert into "users" ("email") values (?)',
        bindings: ['foo']
      }
    });
  });

  it("multiple inserts", function() {
    testsql(qb().from('users').insert([{email: 'foo', name: 'taylor'}, {email: 'bar', name: 'dayle'}]), {
      mysql: {
        sql: 'insert into `users` (`email`, `name`) values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      sqlite3: {
        sql: 'insert into "users" ("email", "name") select ? as "email", ? as "name" union all select ? as "email", ? as "name"',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      oracle: {
        sql: 'begin execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using ?, ?; execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using ?, ?;end;',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      mssql: {
        sql: 'insert into [users] ([email], [name]) values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      default: {
        sql: 'insert into "users" ("email", "name") values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      }
    });
  });

  it("multiple inserts with partly undefined keys client with configuration nullAsDefault: true", function() {
    testquery(qb().from('users').insert([{email: 'foo', name: 'taylor'}, {name: 'dayle'}]), {
      mysql: "insert into `users` (`email`, `name`) values ('foo', 'taylor'), (NULL, 'dayle')",
      sqlite3: 'insert into "users" ("email", "name") select \'foo\' as "email", \'taylor\' as "name" union all select NULL as "email", \'dayle\' as "name"',
      oracle: 'begin execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using \'foo\', \'taylor\'; execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using NULL, \'dayle\';end;',
      mssql: "insert into [users] ([email], [name]) values ('foo', 'taylor'), (NULL, 'dayle')",
      default: 'insert into "users" ("email", "name") values (\'foo\', \'taylor\'), (NULL, \'dayle\')'
    }, clientsWithNullAsDefault);
  });

  it("multiple inserts with partly undefined keys", function() {
    testquery(qb().from('users').insert([{email: 'foo', name: 'taylor'}, {name: 'dayle'}]), {
      mysql: "insert into `users` (`email`, `name`) values ('foo', 'taylor'), (DEFAULT, 'dayle')",
      oracle: 'begin execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using \'foo\', \'taylor\'; execute immediate \'insert into "users" ("email", "name") values (:1, :2)\' using DEFAULT, \'dayle\';end;',
      mssql: "insert into [users] ([email], [name]) values ('foo', 'taylor'), (DEFAULT, 'dayle')",
      default: 'insert into "users" ("email", "name") values (\'foo\', \'taylor\'), (DEFAULT, \'dayle\')'
    });
  });

  it("multiple inserts with partly undefined keys throw error with sqlite", function() {
    expect(function () {
      testquery(qb().from('users').insert([{email: 'foo', name: 'taylor'}, {name: 'dayle'}]), {
        sqlite3: ""
      });
    }).to.throw(TypeError)
  });

  it("multiple inserts with returning", function() {
    // returning only supported directly by postgres and with workaround with oracle
    // other databases implicitly return the inserted id
    testsql(qb().from('users').insert([{email: 'foo', name: 'taylor'}, {email: 'bar', name: 'dayle'}], 'id'), {
      mysql: {
        sql: 'insert into `users` (`email`, `name`) values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      sqlite3: {
        sql: "insert into \"users\" (\"email\", \"name\") select ? as \"email\", ? as \"name\" union all select ? as \"email\", ? as \"name\"",
      },
      postgres: {
        sql: "insert into \"users\" (\"email\", \"name\") values (?, ?), (?, ?) returning \"id\"",
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      oracle: {
        sql: "begin execute immediate 'insert into \"users\" (\"email\", \"name\") values (:1, :2) returning ROWID into :3' using ?, ?, out ?; execute immediate 'insert into \"users\" (\"email\", \"name\") values (:1, :2) returning ROWID into :3' using ?, ?, out ?;end;",
        bindings: function(bindings) {
          expect(bindings.length).to.equal(6);
          expect(bindings[0]).to.equal('foo');
          expect(bindings[1]).to.equal('taylor');
          expect(bindings[2].toString()).to.equal('[object ReturningHelper:id]');
          expect(bindings[3]).to.equal('bar');
          expect(bindings[4]).to.equal('dayle');
          expect(bindings[5].toString()).to.equal('[object ReturningHelper:id]');
        }
      },
      mssql: {
        sql: 'insert into [users] ([email], [name]) output inserted.[id] values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      default: {
        sql: 'insert into \"users\" (\"email\", \"name\") values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      }
    });
  });

  it("multiple inserts with multiple returning", function() {
    testsql(qb().from('users').insert([{email: 'foo', name: 'taylor'}, {email: 'bar', name: 'dayle'}], ['id', 'name']), {
      mysql: {
        sql: 'insert into `users` (`email`, `name`) values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      sqlite3: {
        sql: "insert into \"users\" (\"email\", \"name\") select ? as \"email\", ? as \"name\" union all select ? as \"email\", ? as \"name\"",
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      postgres: {
        sql: 'insert into "users" ("email", "name") values (?, ?), (?, ?) returning "id", "name"',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      oracle: {
        sql: "begin execute immediate 'insert into \"users\" (\"email\", \"name\") values (:1, :2) returning ROWID into :3' using ?, ?, out ?; execute immediate 'insert into \"users\" (\"email\", \"name\") values (:1, :2) returning ROWID into :3' using ?, ?, out ?;end;",
        bindings: function (bindings) {
          expect(bindings.length).to.equal(6);
          expect(bindings[0]).to.equal('foo');
          expect(bindings[1]).to.equal('taylor');
          expect(bindings[2].toString()).to.equal('[object ReturningHelper:id:name]');
          expect(bindings[3]).to.equal('bar');
          expect(bindings[4]).to.equal('dayle');
          expect(bindings[5].toString()).to.equal('[object ReturningHelper:id:name]');
        }
      },
      mssql: {
        sql: 'insert into [users] ([email], [name]) output inserted.[id], inserted.[name] values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      },
      default: {
        sql: 'insert into \"users\" (\"email\", \"name\") values (?, ?), (?, ?)',
        bindings: ['foo', 'taylor', 'bar', 'dayle']
      }
    });
  });

  it("insert method respects raw bindings", function() {
    testsql(qb().insert({'email': raw('CURRENT TIMESTAMP')}).into('users'), {
      mysql: {
        sql: 'insert into `users` (`email`) values (CURRENT TIMESTAMP)',
        bindings: []
      },
      mssql: {
        sql: 'insert into [users] ([email]) values (CURRENT TIMESTAMP)',
        bindings: []
      },
      default: {
        sql: 'insert into "users" ("email") values (CURRENT TIMESTAMP)',
        bindings: []
      }
    });
  });

  it("normalizes for missing keys in insert", function() {
    var data = [{a: 1}, {b: 2}, {a: 2, c: 3}];

    //This is done because sqlite3 does not support valueForUndefined, and can't manipulate testsql to use 'clientsWithUseNullForUndefined'.
    //But we still want to make sure that when `useNullAsDefault` is explicitly defined, that the query still works as expected. (Bindings being undefined)
    //It's reset at the end of the test.
    var previousValuesForUndefinedSqlite3 = clients.sqlite3.valueForUndefined;
    clients.sqlite3.valueForUndefined = null;

    testsql(qb().insert(data).into('table'), {
      mysql: {
        sql: 'insert into `table` (`a`, `b`, `c`) values (?, ?, ?), (?, ?, ?), (?, ?, ?)',
        bindings: [1, valuesForUndefined.mysql, valuesForUndefined.mysql, valuesForUndefined.mysql, 2, valuesForUndefined.mysql, 2, valuesForUndefined.mysql, 3]
      },
      sqlite3: {
        sql: 'insert into "table" ("a", "b", "c") select ? as "a", ? as "b", ? as "c" union all select ? as "a", ? as "b", ? as "c" union all select ? as "a", ? as "b", ? as "c"',
        bindings: [1, undefined, undefined, undefined, 2, undefined, 2, undefined, 3]
      },
      oracle: {
        sql: "begin execute immediate 'insert into \"table\" (\"a\", \"b\", \"c\") values (:1, :2, :3)' using ?, ?, ?; execute immediate 'insert into \"table\" (\"a\", \"b\", \"c\") values (:1, :2, :3)' using ?, ?, ?; execute immediate 'insert into \"table\" (\"a\", \"b\", \"c\") values (:1, :2, :3)' using ?, ?, ?;end;",
        bindings: [1, valuesForUndefined.oracle, valuesForUndefined.oracle, valuesForUndefined.oracle, 2, valuesForUndefined.oracle, 2, valuesForUndefined.oracle, 3]
      },
      mssql: {
        sql: 'insert into [table] ([a], [b], [c]) values (?, ?, ?), (?, ?, ?), (?, ?, ?)',
        bindings: [1, valuesForUndefined.mssql, valuesForUndefined.mssql, valuesForUndefined.mssql, 2, valuesForUndefined.mssql, 2, valuesForUndefined.mssql, 3]
      },
      default: {
        sql: 'insert into "table" ("a", "b", "c") values (?, ?, ?), (?, ?, ?), (?, ?, ?)',
        bindings: [1, valuesForUndefined.default, valuesForUndefined.default, valuesForUndefined.default, 2, valuesForUndefined.default, 2, valuesForUndefined.default, 3]
      }
    });
    clients.sqlite3.valueForUndefined = previousValuesForUndefinedSqlite3;
  });

  it("empty insert should be a noop", function() {
    testsql(qb().into('users').insert(), {
      mysql: {
        sql: '',
        bindings: []
      },
      oracle: {
        sql: '',
        bindings: []
      },
      mssql: {
        sql: '',
        bindings: []
      },
      default: {
        sql: '',
        bindings: []
      }
    });
  });

  it("insert with empty array should be a noop", function() {
    testsql(qb().into('users').insert([]), {
      mysql: {
        sql: '',
        bindings: []
      },
      oracle: {
        sql: '',
        bindings: []
      },
      mssql: {
        sql: '',
        bindings: []
      },
      default: {
        sql: '',
        bindings: []
      }
    });
  });

  it("insert with array with empty object and returning", function() {
    testsql(qb().into('users').insert([{}], 'id'), {
      mysql: {
        sql: 'insert into `users` () values ()',
        bindings: []
      },
      sqlite3: {
        sql: 'insert into "users" default values',
        bindings: []
      },
      postgres: {
        sql: 'insert into "users" default values returning "id"',
        bindings: []
      },
      oracle: {
        sql: "insert into \"users\" (\"id\") values (default) returning ROWID into ?",
        bindings: function (bindings) {
          expect(bindings.length).to.equal(1);
          expect(bindings[0].toString()).to.equal('[object ReturningHelper:id]');
        }
      },
      mssql: {
        sql: 'insert into [users] output inserted.[id] default values',
        bindings: []
      },
      default: {
        sql: 'insert into "users" default values',
        bindings: []
      }
    });
  });

  // it("insert with array with null value and returning is a noop", function() {
  //   testsql(qb().into('users').insert([null], 'id'), {
  //     mysql: {
  //       sql: '',
  //       bindings: []
  //     },
  //     sqlite3: {
  //       sql: '',
  //       bindings: []
  //     },
  //     postgres: {
  //       sql: '',
  //       bindings: []
  //     },
  //     oracle: {
  //       sql: "",
  //       bindings: []
  //     },
  //     mssql: {
  //       sql: '',
  //       bindings: []
  //     },
  //     default: {
  //       sql: '',
  //       bindings: []
  //     }
  //   });
  // });

  // it("insert with array of multiple null values is a noop", function() {
  //   testsql(qb().into('users').insert([null, null]), {
  //     mysql: {
  //       sql: '',
  //       bindings: []
  //     },
  //     sqlite3: {
  //       sql: '',
  //       bindings: []
  //     },
  //     oracle: {
  //       sql: "",
  //       bindings: []
  //     },
  //     postgres: {
  //       sql: "",
  //       bindings: []
  //     },
  //     mssql: {
  //       sql: '',
  //       bindings: []
  //     },
  //     default: {
  //       sql: '',
  //       bindings: []
  //     }
  //   });
  // });

  // it("insert with multiple array of empty values", function() {
  //   testsql(qb().into('users').insert([{}, {}]), {
  //     mysql: {
  //       sql: 'insert into `users` () values (), ()',
  //       bindings: []
  //     },
  //     sqlite3: {
  //       // This does not work
  //       // Not possible to insert multiple default value rows at once with sqlite
  //       sql: 'insert into "users" () select  union all select ',
  //       bindings: []
  //     },
  //     oracle: {
  //       // This does not work
  //       // It's not possible to insert default value without knowing at least one column
  //       sql: "begin execute immediate 'insert into \"users\" (\"undefined\") values (default); execute immediate 'insert into \"users\" (\"undefined\") values (default);end;",
  //       bindings: []
  //     },
  //     postgres: {
  //       // This does not work
  //       // Postgres does not support inserting multiple default values without specifying a column
  //       sql: "insert into \"users\" (\"undefined\") values (default), (default)",
  //       bindings: []
  //     },
  //     mssql: {
  //       sql: 'insert into [users] () values (), ()',
  //       bindings: []
  //     },
  //     default: {
  //       sql: 'insert into "users" default values',
  //       bindings: []
  //     }
  //   });
  // });

  // it("insert with multiple empty values with returning", function() {
  //   testsql(qb().into('users').insert([null, null], 'id'), {
  //     mysql: {
  //       sql: 'insert into `users` () values (), ()',
  //       bindings: []
  //     },
  //     sqlite3: {
  //       // It's not possible to insert multiple default value rows at once with sqlite
  //       sql: 'insert into "users" () select  union all select ',
  //       bindings: []
  //     },
  //     oracle: {
  //       sql: "begin execute immediate 'insert into \"users\" (\"id\") values (default) returning ROWID into :1' using out ?; execute immediate 'insert into \"users\" (\"id\") values (default) returning ROWID into :1' using out ?;end;",
  //       bindings: function (bindings) {
  //         expect(bindings.length).to.equal(2);
  //         expect(bindings[0].toString()).to.equal('[object ReturningHelper:id]');
  //         expect(bindings[1].toString()).to.equal('[object ReturningHelper:id]');
  //       }
  //     },
  //     postgres: {
  //       sql: 'insert into "users" ("id") values (default), (default) returning "id"',
  //       bindings: []
  //     },
  //     mssql: {
  //       sql: 'insert into [users] () values (), ()',
  //       bindings: []
  //     },
  //     default: {
  //       sql: 'not checked',
  //       bindings: []
  //     }
  //   });
  // });

  it("update method", function() {
    testsql(qb().update({'email': 'foo', 'name': 'bar'}).table('users').where('id', '=', 1), {
      mysql: {
        sql: 'update `users` set `email` = ?, `name` = ? where `id` = ?',
        bindings: ['foo', 'bar', 1]
      },
      mssql: {
        sql: 'update [users] set [email] = ?, [name] = ? where [id] = ?;select @@rowcount',
        bindings: ['foo', 'bar', 1]
      },
      default: {
        sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
        bindings: ['foo', 'bar', 1]
      }
    });
  });

  it("should not update columns undefined values", function() {
    testsql(qb().update({'email': 'foo', 'name': undefined}).table('users').where('id', '=', 1), {
      mysql: {
        sql: 'update `users` set `email` = ? where `id` = ?',
        bindings: ['foo', 1]
      },
      default: {
        sql: 'update "users" set "email" = ? where "id" = ?',
        bindings: ['foo', 1]
      }
    });
  });

  it("should allow for 'null' updates", function() {
    testsql(qb().update({email: null, 'name': 'bar'}).table('users').where('id', 1), {
      mysql: {
        sql: 'update `users` set `email` = ?, `name` = ? where `id` = ?',
        bindings: [null, 'bar', 1]
      },
      mssql: {
        sql: 'update [users] set [email] = ?, [name] = ? where [id] = ?;select @@rowcount',
        bindings: [null, 'bar', 1]
      },
      default: {
        sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
        bindings: [null, 'bar', 1]
      }
    });
  });

  it("order by, limit", function() {
    // update with limit works only with mysql and derrivates
    testsql(qb().from('users').where('id', '=', 1).orderBy('foo', 'desc').limit(5).update({email: 'foo', name: 'bar'}), {
      mysql: {
        sql: 'update `users` set `email` = ?, `name` = ? where `id` = ? order by `foo` desc limit ?',
        bindings: ['foo', 'bar', 1, 5]
      },
      mssql: {
        sql: 'update top (?) [users] set [email] = ?, [name] = ? where [id] = ? order by [foo] desc;select @@rowcount',
        bindings: ['foo', 'bar', 1, 5]
      },
      default: {
        sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
        bindings: ['foo', 'bar', 1]
      }
    });
  });

  it("update method with joins mysql", function() {
    testsql(qb().from('users').join('orders', 'users.id', 'orders.user_id').where('users.id', '=', 1).update({'email': 'foo', 'name': 'bar'}), {
      mysql: {
        sql: 'update `users` inner join `orders` on `users`.`id` = `orders`.`user_id` set `email` = ?, `name` = ? where `users`.`id` = ?',
        bindings: ['foo', 'bar', 1]
      },
      mssql: {
        sql: 'update [users] inner join [orders] on [users].[id] = [orders].[user_id] set [email] = ?, [name] = ? where [users].[id] = ?;select @@rowcount',
        bindings: ['foo', 'bar', 1]
      },
      default: {
        sql: "update \"users\" set \"email\" = ?, \"name\" = ? where \"users\".\"id\" = ?",
        bindings: ['foo', 'bar', 1]
      },
    });
  });

  it("update method with limit mysql", function() {
    // limit works only with mysql or derrivates
    testsql(qb().from('users').where('users.id', '=', 1).update({'email': 'foo', 'name': 'bar'}).limit(1), {
      mysql: {
        sql: 'update `users` set `email` = ?, `name` = ? where `users`.`id` = ? limit ?',
        bindings: ['foo', 'bar', 1, 1]
      },
      mssql: {
        sql: 'update top (?) [users] set [email] = ?, [name] = ? where [users].[id] = ?;select @@rowcount',
        bindings: ['foo', 'bar', 1, 1]
      },
      default: {
        sql: 'update "users" set "email" = ?, "name" = ? where "users"."id" = ?',
        bindings: ['foo', 'bar', 1]
      }
    });
  });

  it("update method without joins on postgres", function() {
    testsql(qb().from('users').where('id', '=', 1).update({email: 'foo', name: 'bar'}), {
      mysql: {
        sql: 'update `users` set `email` = ?, `name` = ? where `id` = ?',
        bindings: ['foo', 'bar', 1]
      },
      mssql: {
        sql: 'update [users] set [email] = ?, [name] = ? where [id] = ?;select @@rowcount',
        bindings: ['foo', 'bar', 1]
      },
      default: {
        sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
        bindings: ['foo', 'bar', 1]
      }
    });
  });

  it("update method with returning on oracle", function() {
    testsql(qb().from('users').where('id', '=', 1).update({email: 'foo', name: 'bar'}, '*'), {
      oracle: {
        sql: 'update "users" set "email" = ?, "name" = ? where "id" = ? returning ROWID into ?',
        bindings: function(bindings) {
          expect(bindings.length).to.equal(4);
          expect(bindings[0]).to.equal('foo');
          expect(bindings[1]).to.equal('bar');
          expect(bindings[2]).to.equal(1);
          expect(bindings[3].toString()).to.equal('[object ReturningHelper:*]');
        }
      },
      default: {
        sql: 'update "users" set "email" = ?, "name" = ? where "id" = ?',
        bindings: ['foo', 'bar', 1]
      }
    });
  });

  // TODO:
  // it("update method with joins on postgres", function() {
  //   chain = qb().from('users').join('orders', 'users.id', '=', 'orders.user_id').where('users.id', '=', 1).update({email: 'foo', name: 'bar'}).toSQL();
  //   expect(chain.sql).to.equal('update "users" set "email" = ?, "name" = ? from "orders" where "users"."id" = ? and "users"."id" = "orders"."user_id"');
  //   expect(chain.sql).to.eql(['foo', 'bar', 1]);
  // });

  it("update method respects raw", function() {
    testsql(qb().from('users').where('id', '=', 1).update({email: raw('foo'), name: 'bar'}), {
      mysql: {
        sql: 'update `users` set `email` = foo, `name` = ? where `id` = ?',
        bindings: ['bar', 1]
      },
      mssql: {
        sql: 'update [users] set [email] = foo, [name] = ? where [id] = ?;select @@rowcount',
        bindings: ['bar', 1]
      },
      default: {
        sql: 'update "users" set "email" = foo, "name" = ? where "id" = ?',
        bindings: ['bar', 1]
      }
    });
  });

  it("delete method", function() {
    testsql(qb().from('users').where('email', '=', 'foo').delete(), {
      mysql: {
        sql: 'delete from `users` where `email` = ?',
        bindings: ['foo']
      },
      mssql: {
        sql: 'delete from [users] where [email] = ?;select @@rowcount',
        bindings: ['foo']
      },
      default: {
        sql: 'delete from "users" where "email" = ?',
        bindings: ['foo']
      }
    });
  });

  it("truncate method", function() {
    testsql(qb().table('users').truncate(), {
      mysql: {
        sql: 'truncate `users`',
        bindings: []
      },
      sqlite3: {
        sql: 'delete from "users"',
        bindings: [],
        output: function (output) {
          expect(typeof output).to.equal('function');
        }
      },
      postgres: {
        sql: 'truncate "users" restart identity',
        bindings: []
      },
      oracle: {
        sql: 'truncate table "users"',
        bindings: []
      },
      mssql: {
        sql: 'truncate table [users]',
        bindings: []
      },
      default: {
        sql: 'truncate "users"',
        bindings: []
      }
    });
  });

  it("insert get id", function() {
    testsql(qb().from('users').insert({email: 'foo'}, 'id'), {
      mysql: {
        sql: 'insert into `users` (`email`) values (?)',
        bindings: ['foo']
      },
      postgres: {
        sql: 'insert into "users" ("email") values (?) returning "id"',
        bindings: ['foo']
      },
      oracle: {
        sql: 'insert into "users" ("email") values (?) returning ROWID into ?',
        bindings: function (bindings) {
          expect(bindings.length).to.equal(2);
          expect(bindings[0]).to.equal('foo');
          expect(bindings[1].toString()).to.equal('[object ReturningHelper:id]');
        }
      },
      mssql: {
        sql: 'insert into [users] ([email]) output inserted.[id] values (?)',
        bindings: ['foo']
      },
      default: {
        sql: 'insert into "users" ("email") values (?)',
        bindings: ['foo']
      }
    });
  });

  it("wrapping", function() {
    testsql(qb().select('*').from('users'), {
      mysql: 'select * from `users`',
      mssql: 'select * from [users]',
      default: 'select * from "users"'
    });
  });

  it("order by desc", function() {
    testsql(qb().select('*').from('users').orderBy('email', 'desc'), {
      mysql: 'select * from `users` order by `email` desc',
      mssql: 'select * from [users] order by [email] desc',
      default: 'select * from "users" order by "email" desc'
    });
  });

  // it("sql server limits and offsets", function() {
  //   $builder = $this.getSqlServerBuilder();
  //   $builder.select('*').from('users').limit(10).toSQL();
  //   expect(chain.sql).to.equal('select top (10) * from [users]');

  //   $builder = $this.getSqlServerBuilder();
  //   $builder.select('*').from('users').offset(10).toSQL();
  //   expect(chain.sql).to.equal('select * from (select *, row_number() over (order by (select 0)) as row_num from [users]) as temp_table where row_num >= 11');

  //   $builder = $this.getSqlServerBuilder();
  //   $builder.select('*').from('users').offset(10).limit(10).toSQL();
  //   expect(chain.sql).to.equal('select * from (select *, row_number() over (order by (select 0)) as row_num from [users]) as temp_table where row_num between 11 and 20');

  //   $builder = $this.getSqlServerBuilder();
  //   $builder.select('*').from('users').offset(10).limit(10).orderBy('email', 'desc').toSQL();
  //   expect(chain.sql).to.equal('select * from (select *, row_number() over (order by [email] desc) as row_num from [users]) as temp_table where row_num between 11 and 20');
  // });

  it("providing null or false as second parameter builds correctly", function() {
    testsql(qb().select('*').from('users').where('foo', null), {
      mysql: 'select * from `users` where `foo` is null',
      mssql: 'select * from [users] where [foo] is null',
      default: 'select * from "users" where "foo" is null'
    });
  });

  // it("lock for update", function (){
  //   testsql(tb().select('*').from('foo').where('bar', '=', 'baz').forUpdate(), {
  //     mysql: {
  //       sql: 'select * from `foo` where `bar` = ? for update',
  //       bindings: ['baz']
  //     },
  //     postgres: {
  //       sql: 'select * from "foo" where "bar" = ? for update',
  //       bindings: ['baz']
  //     },
  //     oracle: {
  //       sql: 'select * from "foo" where "bar" = ? for update',
  //       bindings: ['baz']
  //     },
  //     mssql: {
  //       sql: 'select * from [foo] where [bar] = ? with (READCOMMITTEDLOCK)',
  //       bindings: ['baz']
  //     },
  //     default: {
  //       sql: 'select * from "foo" where "bar" = ?',
  //       bindings: ['baz']
  //     }
  //   });
  // });

  // it("lock in share mode", function() {
  //   testsql(qb().transacting({}).select('*').from('foo').where('bar', '=', 'baz').forShare(), {
  //     mysql: {
  //       sql: 'select * from `foo` where `bar` = ? lock in share mode',
  //       bindings: ['baz']
  //     },
  //     postgres: {
  //       sql: "select * from \"foo\" where \"bar\" = ? for share",
  //       bindings: ['baz']
  //     },
  //     mssql: {
  //       sql: 'select * from [foo] where [bar] = ? with (NOLOCK)',
  //       bindings: ['baz']
  //     },
  //     default: {
  //       sql: 'select * from "foo" where "bar" = ?',
  //       bindings: ['baz']
  //     }
  //   });
  // });

  it("should warn when trying to use forUpdate outside of a transaction", function() {
    testsql(qb().select('*').from('foo').where('bar', '=', 'baz').forUpdate(), {
      mysql: {
        sql: 'select * from `foo` where `bar` = ?',
        bindings: ['baz']
      },
      mssql: {
        sql: 'select * from [foo] where [bar] = ?',
        bindings: ['baz']
      },
      default: {
        sql: 'select * from "foo" where "bar" = ?',
        bindings: ['baz']
      }
    });
  });

  // it("SQLServer lock", function() {
  //   $builder = $this.getSqlServerBuilder();
  //   $builder.select('*').from('foo').where('bar', '=', 'baz').lock().toSQL();
  //   expect(chain.sql).to.equal('select * from [foo] with(rowlock,updlock,holdlock) where [bar] = ?');
  //   expect(chain.bindings).to.eql(array('baz'));

  //   $builder = $this.getSqlServerBuilder();
  //   $builder.select('*').from('foo').where('bar', '=', 'baz').lock(false).toSQL();
  //   expect(chain.sql).to.equal('select * from [foo] with(rowlock,holdlock) where [bar] = ?');
  //   expect(chain.bindings).to.eql(array('baz'));
  // });

  it('allows insert values of sub-select, #121', function() {
    testsql(qb().table('entries').insert({
      secret: 123,
      sequence: qb().count('*').from('entries').where('secret', 123)
    }), {
      mysql: {
        sql: 'insert into `entries` (`secret`, `sequence`) values (?, (select count(*) from `entries` where `secret` = ?))',
        bindings: [123, 123]
      },
      mssql: {
        sql: 'insert into [entries] ([secret], [sequence]) values (?, (select count(*) from [entries] where [secret] = ?))',
        bindings: [123, 123]
      },
      default: {
        sql: 'insert into "entries" ("secret", "sequence") values (?, (select count(*) from "entries" where "secret" = ?))',
        bindings: [123, 123]
      }
    });
  });

  it('allows left outer join with raw values', function() {
    testsql(qb().select('*').from('student').leftOuterJoin('student_languages', function() {
      this.on('student.id', 'student_languages.student_id').andOn('student_languages.code', raw('?', 'en_US'));
    }), {
      mysql: {
        sql: 'select * from `student` left outer join `student_languages` on `student`.`id` = `student_languages`.`student_id` and `student_languages`.`code` = ?',
        bindings: ['en_US']
      },
      mssql: {
        sql: 'select * from [student] left outer join [student_languages] on [student].[id] = [student_languages].[student_id] and [student_languages].[code] = ?',
        bindings: ['en_US']
      },
      default: {
        sql: 'select * from "student" left outer join "student_languages" on "student"."id" = "student_languages"."student_id" and "student_languages"."code" = ?',
        bindings: ['en_US']
      }
    });
  });

  it('should not break with null call #182', function() {
    testsql(qb().from('test').limit(null).offset(null), {
      mysql: {
        sql: 'select * from `test`',
        bindings: []
      },
      mssql: {
        sql: 'select * from [test]',
        bindings: []
      },
      default: {
        sql: 'select * from "test"',
        bindings: []
      }
    });
  });

  it('allows passing builder into where clause, #162', function() {
    var chain = qb().from('chapter').select('id').where('book', 1);
    var page = qb().from('page').select('id').whereIn('chapter_id', chain);
    var word = qb().from('word').select('id').whereIn('page_id', page);
    var three = chain.clone().del();
    var two = page.clone().del();
    var one = word.clone().del();

    testsql(one, {
      mysql: {
        sql: 'delete from `word` where `page_id` in (select `id` from `page` where `chapter_id` in (select `id` from `chapter` where `book` = ?))',
        bindings: [1]
      },
      mssql: {
        sql: 'delete from [word] where [page_id] in (select [id] from [page] where [chapter_id] in (select [id] from [chapter] where [book] = ?));select @@rowcount',
        bindings: [1]
      },
      default: {
        sql: 'delete from "word" where "page_id" in (select "id" from "page" where "chapter_id" in (select "id" from "chapter" where "book" = ?))',
        bindings: [1]
      }
    });

    testsql(two, {
      mysql: {
        sql: 'delete from `page` where `chapter_id` in (select `id` from `chapter` where `book` = ?)',
        bindings: [1]
      },
      mssql: {
        sql: 'delete from [page] where [chapter_id] in (select [id] from [chapter] where [book] = ?);select @@rowcount',
        bindings: [1]
      },
      default: {
        sql: 'delete from "page" where "chapter_id" in (select "id" from "chapter" where "book" = ?)',
        bindings: [1]
      }
    });

    testsql(three, {
      mysql: {
        sql: 'delete from `chapter` where `book` = ?',
        bindings: [1]
      },
      mssql: {
        sql: 'delete from [chapter] where [book] = ?;select @@rowcount',
        bindings: [1]
      },
      default: {
        sql: 'delete from "chapter" where "book" = ?',
        bindings: [1]
      }
    });
  });

  it('allows specifying the columns and the query for insert, #211', function() {
    var id = 1;
    var email = 'foo@bar.com';
    testsql(qb().into(raw('recipients (recipient_id, email)')).insert(
      qb().select(raw('?, ?', [id, email])).whereNotExists(function() {
        this.select(1).from('recipients').where('recipient_id', id);
      })), {
      mysql: {
        sql: 'insert into recipients (recipient_id, email) select ?, ? where not exists (select 1 from `recipients` where `recipient_id` = ?)',
        bindings: [1, 'foo@bar.com', 1]
      },
      mssql: {
        sql: 'insert into recipients (recipient_id, email) select ?, ? where not exists (select 1 from [recipients] where [recipient_id] = ?)',
        bindings: [1, 'foo@bar.com', 1]
      },
      default: {
        sql: 'insert into recipients (recipient_id, email) select ?, ? where not exists (select 1 from "recipients" where "recipient_id" = ?)',
        bindings: [1, 'foo@bar.com', 1]
      }
    });
  });

  it('does an update with join on mysql, #191', function() {
    var setObj = {'tblPerson.City': 'Boonesville'};
    var query = qb().table('tblPerson').update(setObj)
      .join('tblPersonData', 'tblPersonData.PersonId', '=', 'tblPerson.PersonId')
      .where('tblPersonData.DataId', 1)
      .where('tblPerson.PersonId', 5 );

    testsql(query, {
      mysql: {
        sql: 'update `tblPerson` inner join `tblPersonData` on `tblPersonData`.`PersonId` = `tblPerson`.`PersonId` set `tblPerson`.`City` = ? where `tblPersonData`.`DataId` = ? and `tblPerson`.`PersonId` = ?',
        bindings: ['Boonesville', 1, 5]
      },
      mssql: {
        sql: 'update [tblPerson] inner join [tblPersonData] on [tblPersonData].[PersonId] = [tblPerson].[PersonId] set [tblPerson].[City] = ? where [tblPersonData].[DataId] = ? and [tblPerson].[PersonId] = ?;select @@rowcount',
        bindings: ['Boonesville', 1, 5]
      },
      default: {
        sql: 'update "tblPerson" set "tblPerson"."City" = ? where "tblPersonData"."DataId" = ? and "tblPerson"."PersonId" = ?',
        bindings: ['Boonesville', 1, 5]
      }
    });
  });

  it('does crazy advanced inserts with clever raw use, #211', function() {
    var q1 = qb().select(raw("'user'"), raw("'user@foo.com'")).whereNotExists(function() {
      this.select(1).from('recipients').where('recipient_id', 1);
    })
    var q2 = qb().table('recipients').insert(raw('(recipient_id, email) ?', [q1]));

    testsql(q2, {
      // mysql: {
      //   sql: 'insert into `recipients` (recipient_id, email) select \'user\', \'user@foo.com\' where not exists (select 1 from `recipients` where `recipient_id` = ?)',
      //   bindings: [1]
      // },
      // mssql: {
      //   sql: 'insert into [recipients] (recipient_id, email) select \'user\', \'user@foo.com\' where not exists (select 1 from [recipients] where [recipient_id] = ?)',
      //   bindings: [1]
      // },
      default: {
        sql: 'insert into "recipients" (recipient_id, email) select \'user\', \'user@foo.com\' where not exists (select 1 from "recipients" where "recipient_id" = ?)',
        bindings: [1]
      }
    });
  });

  it('supports capitalized operators', function() {
    testsql(qb().select('*').from('users').where('name', 'LIKE', '%test%'), {
      mysql: {
        sql: 'select * from `users` where `name` LIKE ?',
        bindings: ['%test%']
      },
      mssql: {
        sql: 'select * from [users] where [name] LIKE ?',
        bindings: ['%test%']
      },
      default: {
        sql: 'select * from "users" where "name" LIKE ?',
        bindings: ['%test%']
      }
    });
  });

  it('supports POSIX regex operators in Postgres', function() {
    testsql(qb().select('*').from('users').where('name', '~', '.*test.*'), {
      postgres: {
        sql: 'select * from "users" where "name" ~ ?',
        bindings: ['.*test.*']
      }
    });
  });

  it('throws if you try to use an invalid operator', function() {
    expect(function () {
      qb().select('*').where('id', 'isnt', 1).toString();
    })
    .to.throw("The operator \"isnt\" is not permitted");
  });

  it('throws if you try to use an invalid operator in an inserted statement', function() {
    var obj = qb().select('*').where('id', 'isnt', 1);
    expect(function () {
      qb().select('*').from('users').where('id', 'in', obj).toString();
    })
    .to.throw("The operator \"isnt\" is not permitted");
  });

  it("#287 - wraps correctly for arrays", function() {
    // arrays only work for postgres
    testsql(qb().select('*').from('value').join('table', 'table.array_column[1]', '=', raw('?', 1)), {
      mysql: {
        sql: 'select * from `value` inner join `table` on `table`.`array_column[1]` = ?',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [value] inner join [table] on [table].[array_column[1]] = ?',
        bindings: [1]
      },
      postgres: {
        sql: 'select * from "value" inner join "table" on "table"."array_column"[1] = ?',
        bindings: ['1']
      },
      default: {
        sql: 'select * from "value" inner join "table" on "table"."array_column[1]" = ?',
        bindings: [1]
      }

    });
  });

  it('allows wrap on raw to wrap in parens and alias', function() {
    testsql(qb().select(
      'e.lastname',
      'e.salary',
      raw(
        qb().select('avg(salary)').from('employee').whereRaw('dept_no = e.dept_no')
      ).wrap('(', ') avg_sal_dept')
    ).from('employee as e')
    .where('dept_no', '=', 'e.dept_no'), {
      // mysql: {
      //   sql: 'select `e`.`lastname`, `e`.`salary`, (select `avg(salary)` from `employee` where dept_no = e.dept_no) avg_sal_dept from `employee` as `e` where `dept_no` = ?',
      //   bindings: ['e.dept_no']
      // },
      oracle: {
        sql: 'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) avg_sal_dept from "employee" "e" where "dept_no" = ?',
        bindings: ['e.dept_no']
      },
      // mssql: {
      //   sql: 'select [e].[lastname], [e].[salary], (select [avg(salary)] from [employee] where dept_no = e.dept_no) avg_sal_dept from [employee] as [e] where [dept_no] = ?',
      //   bindings: ['e.dept_no']
      // },
      default: {
        sql: 'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) avg_sal_dept from "employee" as "e" where "dept_no" = ?',
        bindings: ['e.dept_no']
      }
    });
  });

  it('allows select as syntax', function() {
    testsql(qb().select(
      'e.lastname',
      'e.salary',
      qb().select('avg(salary)').from('employee').whereRaw('dept_no = e.dept_no').as('avg_sal_dept')
    ).from('employee as e')
    .where('dept_no', '=', 'e.dept_no'), {
      mysql: {
        sql: 'select `e`.`lastname`, `e`.`salary`, (select `avg(salary)` from `employee` where dept_no = e.dept_no) as `avg_sal_dept` from `employee` as `e` where `dept_no` = ?',
        bindings: ["e.dept_no"]
      },
      oracle: {
        // TODO: Check if possible
        sql: 'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) "avg_sal_dept" from "employee" "e" where "dept_no" = ?',
        bindings: ["e.dept_no"]
      },
      mssql: {
        sql: 'select [e].[lastname], [e].[salary], (select [avg(salary)] from [employee] where dept_no = e.dept_no) as [avg_sal_dept] from [employee] as [e] where [dept_no] = ?',
        bindings: ["e.dept_no"]
      },
      default: {
        sql: 'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) as "avg_sal_dept" from "employee" as "e" where "dept_no" = ?',
        bindings: ["e.dept_no"]
      }
    });
  });

  it('allows function for subselect column', function() {
    testsql(qb().select(
      'e.lastname',
      'e.salary'
    ).select(function() {
      this.select('avg(salary)').from('employee').whereRaw('dept_no = e.dept_no').as('avg_sal_dept');
    }).from('employee as e')
    .where('dept_no', '=', 'e.dept_no'), {
      mysql: {
        sql: 'select `e`.`lastname`, `e`.`salary`, (select `avg(salary)` from `employee` where dept_no = e.dept_no) as `avg_sal_dept` from `employee` as `e` where `dept_no` = ?',
        bindings: ["e.dept_no"]
      },
      oracle: {
        // TODO: Check if possible
        sql: 'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) "avg_sal_dept" from "employee" "e" where "dept_no" = ?',
        bindings: ["e.dept_no"]
      },
      mssql: {
        sql: 'select [e].[lastname], [e].[salary], (select [avg(salary)] from [employee] where dept_no = e.dept_no) as [avg_sal_dept] from [employee] as [e] where [dept_no] = ?',
        bindings: ["e.dept_no"]
      },
      default: {
        sql: 'select "e"."lastname", "e"."salary", (select "avg(salary)" from "employee" where dept_no = e.dept_no) as "avg_sal_dept" from "employee" as "e" where "dept_no" = ?',
        bindings: ["e.dept_no"]
      }
    });
  });

  it('supports arbitrarily nested raws', function() {
    var chain = qb().select('*').from('places')
      .where(raw('ST_DWithin((places.address).xy, ?, ?) AND ST_Distance((places.address).xy, ?) > ? AND ?', [
        raw('ST_SetSRID(?,?)', [
          raw('ST_MakePoint(?,?)', [-10,10]),
          4326
        ]),
        100000,
        raw('ST_SetSRID(?,?)', [
          raw('ST_MakePoint(?,?)', [-5,5]),
          4326
        ]),
        50000,
        raw('places.id IN ?', [ [1,2,3] ])
      ]));

    testsql(chain, {
      mysql: {
        sql: 'select * from `places` where ST_DWithin((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?), ?) AND ST_Distance((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?)) > ? AND places.id IN ?',
        bindings: [-10, 10, 4326, 100000, -5, 5, 4326, 50000, [1,2,3] ]
      },
      mssql: {
        sql: 'select * from [places] where ST_DWithin((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?), ?) AND ST_Distance((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?)) > ? AND places.id IN ?',
        bindings: [-10, 10, 4326, 100000, -5, 5, 4326, 50000, [1,2,3] ]
      },
      default: {
        sql: 'select * from "places" where ST_DWithin((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?), ?) AND ST_Distance((places.address).xy, ST_SetSRID(ST_MakePoint(?,?),?)) > ? AND places.id IN ?',
        bindings: [-10, 10, 4326, 100000, -5, 5, 4326, 50000, [1,2,3] ]
      }
    });
  });

  it('has joinRaw for arbitrary join clauses', function() {
    testsql(qb().select('*').from('accounts').joinRaw('natural full join table1').where('id', 1), {
      mysql: {
        sql: 'select * from `accounts` natural full join table1 where `id` = ?',
        bindings: [1]
      },
      mssql: {
        sql: 'select * from [accounts] natural full join table1 where [id] = ?',
        bindings: [1]
      },
      default: {
        sql: 'select * from "accounts" natural full join table1 where "id" = ?',
        bindings: [1]
      }
    });
  });

  it('allows a raw query in the second param', function() {
    testsql(qb().select('*').from('accounts').innerJoin(
      'table1', raw('ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))')
    ), {
      mysql: {
        sql: 'select * from `accounts` inner join `table1` on ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))'
      },
      mssql: {
        sql: 'select * from [accounts] inner join [table1] on ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))'
      },
      default: {
        sql: 'select * from "accounts" inner join "table1" on ST_Contains(buildings_pluto.geom, ST_Centroid(buildings_building.geom))'
      }
    });
  });

  it('allows join "using"', function() {
    testsql(qb().select('*').from('accounts').innerJoin('table1', function() {
      this.using('id');
    }), {
      mysql: {
        sql: 'select * from `accounts` inner join `table1` using `id`'
      },
      mssql: {
        //sql: 'select * from [accounts] inner join [table1] on [accounts].[id] = [table1].[id]'
        sql: 'select * from [accounts] inner join [table1] using [id]'
      },
      default: {
        sql: 'select * from "accounts" inner join "table1" using "id"'
      }
    });
  });

  it('allows sub-query function on insert, #427', function() {
    testsql(qb().into('votes').insert(function() {
      this.select('*').from('votes').where('id', 99);
    }), {
      mysql: {
        sql: 'insert into `votes` select * from `votes` where `id` = ?',
        bindings: [99]
      },
      mssql: {
        sql: 'insert into [votes] select * from [votes] where [id] = ?',
        bindings: [99]
      },
      default: {
        sql: 'insert into "votes" select * from "votes" where "id" = ?',
        bindings: [99]
      }
    });
  });

  it('allows sub-query chain on insert, #427', function() {
    testsql(qb().into('votes').insert(qb().select('*').from('votes').where('id', 99)), {
      mysql: {
        sql: 'insert into `votes` select * from `votes` where `id` = ?',
        bindings: [99]
      },
      oracle: {
        sql: 'insert into "votes" select * from "votes" where "id" = ?',
        bindings: [99]
      },
      mssql: {
        sql: 'insert into [votes] select * from [votes] where [id] = ?',
        bindings: [99]
      },
      default: {
        sql: 'insert into "votes" select * from "votes" where "id" = ?',
        bindings: [99]
      }
    });
  });

  it('allows for raw values in join, #441', function() {
    testsql(qb()
      .select('A.nid AS id')
      .from(raw('nidmap2 AS A'))
      .innerJoin(
        raw([
          'SELECT MIN(nid) AS location_id',
          'FROM nidmap2',
        ].join(' ')).wrap('(', ') AS B'),
        'A.x', '=', 'B.x'
      ), {
        mysql: {
          sql: 'select `A`.`nid` as `id` from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on `A`.`x` = `B`.`x`',
          bindings: []
        },
        mssql: {
          sql: 'select [A].[nid] as [id] from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on [A].[x] = [B].[x]',
          bindings: []
        },
        oracle: {
          sql: 'select "A"."nid" "id" from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on "A"."x" = "B"."x"',
          bindings: []
        },
        default: {
          sql: 'select "A"."nid" as "id" from nidmap2 AS A inner join (SELECT MIN(nid) AS location_id FROM nidmap2) AS B on "A"."x" = "B"."x"',
          bindings: []
        }
      });
  });

  it('allows insert values of sub-select without raw, #627', function() {
    testsql(qb().table('entries').insert({
      secret: 123,
      sequence: qb().count('*').from('entries').where('secret', 123)
    }), {
      mysql: {
        sql: 'insert into `entries` (`secret`, `sequence`) values (?, (select count(*) from `entries` where `secret` = ?))',
        bindings: [123, 123]
      },
      mssql: {
        sql: 'insert into [entries] ([secret], [sequence]) values (?, (select count(*) from [entries] where [secret] = ?))',
        bindings: [123, 123]
      },
      default: {
        sql: 'insert into "entries" ("secret", "sequence") values (?, (select count(*) from "entries" where "secret" = ?))',
        bindings: [123, 123]
      }
    });
  });

  it('correctly orders parameters when selecting from subqueries, #704', function() {
    var subquery = qb().select(raw('? as f', ['inner raw select'])).as('g');
    testsql(qb()
      .select(raw('?', ['outer raw select']), 'g.f')
      .from(subquery)
      .where('g.secret', 123),
      {
        mysql: {
          sql: 'select ?, `g`.`f` from (select ? as f) as `g` where `g`.`secret` = ?',
          bindings: ['outer raw select', 'inner raw select', 123]
        },
        oracle: {
          sql: 'select ?, "g"."f" from (select ? as f) "g" where "g"."secret" = ?',
          bindings: ['outer raw select', 'inner raw select', 123]
        },
        mssql: {
          sql: 'select ?, [g].[f] from (select ? as f) as [g] where [g].[secret] = ?',
          bindings: ['outer raw select', 'inner raw select', 123]
        },
        default: {
          sql: 'select ?, "g"."f" from (select ? as f) as "g" where "g"."secret" = ?',
          bindings: ['outer raw select', 'inner raw select', 123]
        }
      });
  });

  it('escapes queries properly, #737', function() {
    testsql(qb()
      .select('id","name', 'id`name')
      .from('test`'),
      {
        mysql: {
          sql: 'select `id","name`, `id``name` from `test```',
          bindings: []
        },
        mssql: {
          sql: 'select [id","name], [id`name] from [test`]',
          bindings: []
        },
        default: {
          sql: 'select "id"",""name", "id`name" from "test`"',
          bindings: []
        }
      });
  });

  it('has a fromJS method for json construction of queries', function() {
    testsql(qb().fromJS({
      select: '*',
      from: 'accounts',
      where: {
        id: 1
      },
      whereIn: ['name', ['a', 'b', 'c']]
    }), {
      mysql: {
        sql: 'select * from `accounts` where `id` = ? and `name` in (?, ?, ?)',
        bindings: [1, 'a', 'b', 'c']
      },
      mssql: {
        sql: 'select * from [accounts] where [id] = ? and [name] in (?, ?, ?)',
        bindings: [1, 'a', 'b', 'c']
      },
      default: {
        sql: 'select * from "accounts" where "id" = ? and "name" in (?, ?, ?)',
        bindings: [1, 'a', 'b', 'c']
      }
    })
  })

  it('has a modify method which accepts a function that can modify the query', function() {
    // arbitrary number of arguments can be passed to `.modify(queryBuilder, ...)`,
    // builder is bound to `this`
    var withBars = function(queryBuilder, table, fk) {
      if(!this || this !== queryBuilder) {
        throw 'Expected query builder passed as first argument and bound as `this` context';
      }
      this
        .leftJoin('bars', table + '.' + fk, 'bars.id')
        .select('bars.*')
    };

    testsql(qb().select('foo_id').from('foos').modify(withBars, 'foos', 'bar_id'), {
      mysql: {
        sql: 'select `foo_id`, `bars`.* from `foos` left join `bars` on `foos`.`bar_id` = `bars`.`id`'
      },
      mssql: {
        sql: 'select [foo_id], [bars].* from [foos] left join [bars] on [foos].[bar_id] = [bars].[id]'
      },
      default: {
        sql: 'select "foo_id", "bars".* from "foos" left join "bars" on "foos"."bar_id" = "bars"."id"'
      }
    })
  })

  it('Allows for empty where #749', function() {
    testsql(qb().select('foo').from('tbl').where(function() {}), {
      mysql:   'select `foo` from `tbl`',
      mssql:   'select [foo] from [tbl]',
      default: 'select "foo" from "tbl"'
    })
  })

  it("escapes single quotes properly", function() {
    testquery(qb().select('*').from('users').where('last_name', 'O\'Brien'), {
      default: 'select * from "users" where "last_name" = \'O\'\'Brien\''
    });
  });

  it("escapes double quotes property", function(){
    testquery(qb().select('*').from('players').where('name', 'Gerald "Ice" Williams'), {
      default: 'select * from "players" where "name" = \'Gerald "Ice" Williams\''
    });
  });

  it("allows join without operator and with value 0 #953", function() {
    testsql(qb().select('*').from('users').join('photos', 'photos.id', 0), {
      mysql: {
        sql: 'select * from `users` inner join `photos` on `photos`.`id` = 0'
      },
      mssql: {
        sql: 'select * from [users] inner join [photos] on [photos].[id] = 0'
      },
      default: {
        sql: 'select * from "users" inner join "photos" on "photos"."id" = 0'
      }
    });
  });

  it("allows join with operator and with value 0 #953", function() {
    testsql(qb().select('*').from('users').join('photos', 'photos.id', '>', 0), {
      mysql: {
        sql: 'select * from `users` inner join `photos` on `photos`.`id` > 0'
      },
      mssql: {
        sql: 'select * from [users] inner join [photos] on [photos].[id] > 0'
      },
      default: {
        sql: 'select * from "users" inner join "photos" on "photos"."id" > 0'
      }
    });
  });

  it("where with date object", function () {
    var date = new Date();
    testsql(qb().select('*').from('users').where("birthday", ">=", date), {
      mysql: {
        sql: 'select * from `users` where `birthday` >= ?',
        bindings: [date]
      },
      mssql: {
        sql: 'select * from [users] where [birthday] >= ?',
        bindings: [date]
      },
      default: {
        sql: 'select * from "users" where "birthday" >= ?',
        bindings: [date]
      }
    });
  });

  it("raw where with date object", function() {
    var date = new Date();
    testsql(qb().select('*').from('users').whereRaw("birthday >= ?", date), {
      mysql: {
        sql: 'select * from `users` where birthday >= ?',
        bindings: [date]
      },
      mssql: {
        sql: 'select * from [users] where birthday >= ?',
        bindings: [date]
      },
      default: {
        sql: 'select * from "users" where birthday >= ?',
        bindings: [date]
      }
    });
  });

  it('#965 - .raw accepts Array and Non-Array bindings', function() {
    var expected = function(fieldName, expectedBindings) {
      return {
        mysql:   {
          sql:      'select * from `users` where ' + fieldName + ' = ?',
          bindings: expectedBindings
        },
        mssql:   {
          sql:      'select * from [users] where ' + fieldName + ' = ?',
          bindings: expectedBindings
        },
        default: {
          sql:      'select * from "users" where ' + fieldName + ' = ?',
          bindings: expectedBindings
        }
      };
    };

    //String
    testsql(qb().select('*').from('users').where(raw('username = ?', 'knex')), expected('username', ['knex']));
    testsql(qb().select('*').from('users').where(raw('username = ?', ['knex'])), expected('username', ['knex']));

    //Number
    testsql(qb().select('*').from('users').where(raw('isadmin = ?', 0)), expected('isadmin', [0]));
    testsql(qb().select('*').from('users').where(raw('isadmin = ?', [1])), expected('isadmin', [1]));

    //Date
    var date = new Date(2016, 0, 5, 10, 19, 30, 599);
    var sqlUpdTime = '2016-01-05 10:19:30.599';
    testsql(qb().select('*').from('users').where(raw('updtime = ?', date)), expected('updtime', [date]));
    testsql(qb().select('*').from('users').where(raw('updtime = ?', [date])), expected('updtime', [date]));
    testquery(qb().select('*').from('users').where(raw('updtime = ?', date)), {
      mysql: 'select * from `users` where updtime = \'' + sqlUpdTime + '\'',
      default: 'select * from "users" where updtime = \'' + sqlUpdTime + '\''
    });
  });

  it("#1118 orWhere({..}) generates or (and - and - and)", function() {
    testsql(qb().select('*').from('users').where('id', '=', 1).orWhere({
      email: 'foo',
      id: 2
    }), {
      mysql: {
        sql: 'select * from `users` where `id` = ? or (`email` = ? and `id` = ?)',
        bindings: [1, 'foo', 2]
      },
      mssql: {
        sql: 'select * from [users] where [id] = ? or ([email] = ? and [id] = ?)',
        bindings: [1, 'foo', 2]
      },
      default: {
        sql: 'select * from "users" where "id" = ? or ("email" = ? and "id" = ?)',
        bindings: [1, 'foo', 2]
      }
    });
  });

  it('#1228 Named bindings', function() {
    testsql(qb().select('*').from('users').whereIn('id', raw('select (:test)', {test: [1,2,3]})), {
      mysql: {
        sql: 'select * from `users` where `id` in (select (?))',
        bindings: [[1,2,3]]
      },
      mssql: {
        sql: 'select * from [users] where [id] in (select (?))',
        bindings: [[1,2,3]]
      },
      default: {
        sql: 'select * from "users" where "id" in (select (?))',
        bindings: [[1,2,3]]
      }
    });


    var namedBindings = {
      name:     'users.name',
      thisGuy:  'Bob',
      otherGuy: 'Jay'
    };
    //Had to do it this way as the 'raw' statement's .toQuery is called before testsql, meaning mssql and other dialects would always get the output of qb() default client
    //as MySQL, which means testing the query per dialect won't work. [users].[name] would be `users`.`name` for mssql which is incorrect.
    var mssql = clients.mssql;
    var mysql = clients.mysql;
    var defaultClient = clients.default;

    var mssqlQb = mssql.queryBuilder().select('*').from('users').where(mssql.raw(':name: = :thisGuy or :name: = :otherGuy', namedBindings)).toSQL();
    var mysqlQb = mysql.queryBuilder().select('*').from('users').where(mysql.raw(':name: = :thisGuy or :name: = :otherGuy', namedBindings)).toSQL();
    var defaultQb = defaultClient.queryBuilder().select('*').from('users').where(defaultClient.raw(':name: = :thisGuy or :name: = :otherGuy', namedBindings)).toSQL();

    expect(mssqlQb.sql).to.equal('select * from [users] where [users].[name] = ? or [users].[name] = ?');
    expect(mssqlQb.bindings).to.deep.equal(['Bob', 'Jay']);

    expect(mysqlQb.sql).to.equal('select * from `users` where `users`.`name` = ? or `users`.`name` = ?');
    expect(mysqlQb.bindings).to.deep.equal(['Bob', 'Jay']);

    expect(defaultQb.sql).to.equal('select * from "users" where "users"."name" = ? or "users"."name" = ?');
    expect(defaultQb.bindings).to.deep.equal(['Bob', 'Jay']);
  });

  it('#1268 - valueForUndefined should be in toSQL(QueryCompiler)', function() {
    testsql(qb().insert([{id: void 0, name: 'test', occupation: void 0}, {id: 1, name: void 0, occupation: 'none'}]).into('users'), {
      mysql: {
        sql: 'insert into `users` (`id`, `name`, `occupation`) values (?, ?, ?), (?, ?, ?)',
        bindings: [valuesForUndefined.mysql, 'test', valuesForUndefined.mysql, 1, valuesForUndefined.mysql, 'none']
      },
      oracle: {
        sql: 'begin execute immediate \'insert into "users" ("id", "name", "occupation") values (:1, :2, :3)\' using ?, ?, ?; execute immediate \'insert into "users" ("id", "name", "occupation") values (:1, :2, :3)\' using ?, ?, ?;end;',
        bindings: [valuesForUndefined.oracle, 'test', valuesForUndefined.oracle, 1, valuesForUndefined.oracle, 'none']
      },
      mssql: {
        sql: 'insert into [users] ([id], [name], [occupation]) values (?, ?, ?), (?, ?, ?)',
        bindings: [valuesForUndefined.mssql, 'test', valuesForUndefined.mssql, 1, valuesForUndefined.mssql, 'none']
      },
      postgres: {
        sql: 'insert into "users" ("id", "name", "occupation") values (?, ?, ?), (?, ?, ?)',
        bindings: [valuesForUndefined.postgres, 'test', valuesForUndefined.postgres, '1', valuesForUndefined.postgres, 'none']
      }
    });

    expect(function() {
      clients.sqlite3.queryBuilder().insert([{id: void 0}]).into('users').toString();
    })
    .to
    .throw(TypeError);

    expect(function() {
      clientsWithNullAsDefault.sqlite3.queryBuilder().insert([{id: void 0}]).into('users').toString();
    })
    .to
    .not
    .throw(TypeError);
  });
});
