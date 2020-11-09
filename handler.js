'use strict';
const AWS = require('aws-sdk');
const db = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
const {"v4": uuidv4} = require('uuid');
const productsTable = process.env.TESTS_TABLE;

// a response helper
const response = (statusCode, message) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
  },
  body: JSON.stringify(message)
});

// sort by date
const sortByDate = (a, b) => a.createdAt > b.createdAt ? -1 : 1; 

// Create a product
module.exports.createProduct = (event, context, callback) => {
  const reqBody = JSON.parse(event.body);
  const userId = event.pathParameters.userId;

  const nameRequired = !reqBody.name || reqBody.name.trim() === '';
  const imageUrlRequired = !reqBody.imageUrl || reqBody.imageUrl.trim() === '';
  const descriptionRequired = !reqBody.description || reqBody.description.trim() === '';
  const priceRequired = !reqBody.price || reqBody.price.trim() === '';

  if (nameRequired || imageUrlRequired || descriptionRequired || priceRequired) {
    return callback(null, response(400, {error: "Product must contains: name, image url, description and price"}));
  }

  const product = {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    userId,
    name: reqBody.name,
    imageUrl: reqBody.imageUrl,
    description: reqBody.description,
    price: reqBody.price
  };

  return db
    .put({
      TableName: productsTable,
      Item: product
    })
    .promise()
    .then(() => {
      callback(null, response(201, product));
    })
    .catch((err) => callback(null, response(err.statusCode, err)));
};

// Get products by userId
module.exports.getProductsByUserId = (event, context, callback) => {
  const userId = event.pathParameters.userId;
  return db
    .scan({ TableName: productsTable })
    .promise()
    .then((res) => {
      callback(null, response(200, res.Items.filter(data => data.userId === userId).sort(sortByDate)));
    })
    .catch((err) => callback(null, response(err.statusCode, err)));
};

// Get a single product
module.exports.getProduct = (event, context, callback) => {
  const productId = event.pathParameters.id;
  return db
    .get({
      TableName: productsTable,
      Key: {
        id: productId
      }
    })
    .promise()
    .then((res) => {
      if (res.Item) {
        return callback(null, response(200, res.Item));
      } else {
        return callback(404, response({error: 'Product not found ..'}));
      }
    })
    .catch((err) => callback(null, response(err.statusCode, err)));
}

// Update a product
module.exports.updateProduct = (event, context, callback) => {
  const id = event.pathParameters.id;
  const reqBody = JSON.parse(event.body);

  // Thank you Reference: https://stackoverflow.com/questions/55825544/how-to-update-a-single-attribute-in-a-dynamodb-item

  const generateUpdateQuery = (dataFields) => {
    let attributesParams = {
        UpdateExpression: 'SET',
        ExpressionAttributeNames: {},
        ExpressionAttributeValues: {}
    }
    Object.entries(dataFields).forEach(([key, value]) => {
      attributesParams.UpdateExpression += ` #${key} = :${key},`;
      attributesParams.ExpressionAttributeNames[`#${key}`] = key;
      attributesParams.ExpressionAttributeValues[`:${key}`] = value;
    });
    
    attributesParams.UpdateExpression = attributesParams.UpdateExpression.slice(0, -1);
    
    return attributesParams;
  };

  const expression = generateUpdateQuery(reqBody);

  const params = {
    Key: {
      id: id
    },
    TableName: productsTable,
    ConditionExpression: 'attribute_exists(id)',
    ...expression,
    ReturnValues: 'UPDATED_NEW'
  };

  return db
    .update(params)
    .promise()
    .then((res) => {
      callback(null, response(200, res.Attributes));
    })
    .catch((err) => callback(null, response(err.statusCode, err)));
};

module.exports.deleteProduct = (event, context, callback) => {
  const productId = event.pathParameters.id;
  return db
    .delete({
      TableName: productsTable,
      Key: {
        id: productId
      }
    })
    .promise()
    .then(() => callback(null, response(200, {message: 'Product has been deleted successfully!'})))
    .catch((err) => callback(null, response(err.statusCode, err)));
};

// For the knowledge: How to remove a item attribute from dynamodb table:
// Try removing all data from that column, it will automatically remove that column.