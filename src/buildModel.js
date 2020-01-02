/*
 * polynode-supermodels-mongodb
 *
 * Released under MIT license. Copyright 2019 Jorge Duarte Rodriguez <info@malagadev.com>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify, merge,
 * publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
 * to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies
 * or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 * $Id$
 *
 * @flow
 * @format
 *
 */
const ajv = require('ajv');
const mongoose = require('mongoose');
require('mongoose-schema-jsonschema')(mongoose);
const Schema = mongoose.Schema;

type AjvValidatorFuncType = Object => boolean & { errors?: null | Array<Error> };

type MongooseHookDefinition = {
  op: String,
  callback: (next: Function) => void,
};

type AppSchemaOptions = {
  populateRecords?: (promise: Promise<any>) => Promise<any>,
  pre?: Array<MongooseHookDefinition>,
  post?: Array<MongooseHookDefinition>,
};

type ValidateFunctionType = (
  jsonSchema: {},
  data: {}
) => { success: boolean, errors: Array<{}> | null };

type FullModelType = {
  model: mongoose$Model,
  jsonSchema: Object,
  validate: ValidateFunctionType,
};

type DatabaseType = {
  getConnection: () => mongoose$Connection,
  getModel: (schemaName: string, schemaObj?: Object, appSchemaOptions?: {}) => mongoose$Model,
};

type GeneratedDependencyFunction = any => FullModelType;

type LoggerType = bunyan$Logger;

const applyHooksToSchema = (
  schemaObj,
  type: 'pre' | 'post',
  hooks: Array<MongooseHookDefinition>
): void => {
  hooks.forEach((hook: MongooseHookDefinition) => {
    schemaObj[type](hook.op, hook.callback);
  });
};

const validate = (jsonSchema: {}, data: {}): { success: boolean, errors: Array<{}> | null } => {
  const _v: AjvValidatorFuncType = ajv.compile(jsonSchema);
  const success: boolean = _v(data);
  return { success, errors: ('errors' in _v && _v.errors && [..._v.errors]) || null };
};

const getConnectedMongooseModel = function(
  conn: mongoose$Connection,
  schemaName: string,
  schemaObj?: null | {} = null,
  appSchemaOptions?: null | {} = null
) {
  if (conn == null) {
    this.log.error({}, '- ERROR: DB is not ready!');
  } else {
    this.log.trace({ schemaName }, 'Loading model');
    if (schemaObj) {
      const model = conn.model(schemaName, schemaObj);
      model._appSchemaOptions = appSchemaOptions;
      return model;
    }
    return conn.model(schemaName);
  }
};

const buildModel = (
  schemaName: string,
  schemaDefs: {},
  schemaOptions: {},
  appSchemaOptions: AppSchemaOptions = {}
): GeneratedDependencyFunction => {
  const schemaObj = new Schema(schemaDefs, schemaOptions);

  if ('pre' in appSchemaOptions && appSchemaOptions.pre) {
    applyHooksToSchema(schemaObj, 'pre', appSchemaOptions.pre);
  }

  if ('post' in appSchemaOptions && appSchemaOptions.post) {
    applyHooksToSchema(schemaObj, 'post', appSchemaOptions.post);
  }

  console.log('inside buildModel for: ', schemaName);

  return ({ db, log }: { db: DatabaseType, log: LoggerType }) => {
    console.log('inside buildModel function for: ', schemaName);

    let model: mongoose$Model;

    try {
      model = getConnectedMongooseModel.bind({ log })(db.getConnection(), schemaName);
    } catch (err) {
      model = getConnectedMongooseModel.bind({ log })(
        db.getConnection(),
        schemaName,
        schemaObj,
        appSchemaOptions
      );
    }

    if (!model) {
      log.fatal({ schemaName, scope: 'polynode-supermodels-mongodb' }, 'Model is null');
      process.exit(1);
    }

    const jsonSchema: {} = schemaObj.jsonSchema();

    return {
      model,
      jsonSchema,
      validate,
    };
  };
};

module.exports = { buildModel };
