import axios from 'axios';
import crypto from 'crypto';
import { getConfig } from './config.js';

/**
 * AWS Signature Version 4 signing helper
 */
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function getSigningKey(secretKey, dateStamp, regionName, serviceName) {
  const kDate = sign('AWS4' + secretKey, dateStamp);
  const kRegion = sign(kDate, regionName);
  const kService = sign(kRegion, serviceName);
  return sign(kService, 'aws4_request');
}

function buildAuthHeader({ method, url, body, service, region, accessKeyId, secretAccessKey, target }) {
  const parsedUrl = new URL(url);
  const host = parsedUrl.host;
  const path = parsedUrl.pathname;
  const queryString = parsedUrl.search ? parsedUrl.search.slice(1) : '';

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash('sha256').update(body || '').digest('hex');

  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';

  const canonicalRequest = [
    method.toUpperCase(),
    path,
    queryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, amzDate };
}

async function athenaRequest(action, body = {}) {
  const accessKeyId = getConfig('accessKeyId');
  const secretAccessKey = getConfig('secretAccessKey');
  const region = getConfig('region') || 'us-east-1';
  const url = `https://athena.${region}.amazonaws.com/`;
  const target = `AmazonAthena.${action}`;
  const bodyStr = JSON.stringify(body);

  const { authorization, amzDate } = buildAuthHeader({
    method: 'POST',
    url,
    body: bodyStr,
    service: 'athena',
    region,
    accessKeyId,
    secretAccessKey,
    target
  });

  try {
    const response = await axios.post(url, bodyStr, {
      headers: {
        'Authorization': authorization,
        'X-Amz-Date': amzDate,
        'X-Amz-Target': target,
        'Content-Type': 'application/x-amz-json-1.1',
        'Accept': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

function handleApiError(error) {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    if (status === 401 || status === 403) {
      throw new Error('AWS authentication failed. Check your accessKeyId and secretAccessKey.');
    } else if (status === 404) {
      throw new Error('Resource not found.');
    } else if (status === 429) {
      throw new Error('Rate limit exceeded. Please wait before retrying.');
    } else {
      const message = data?.message || data?.Message || data?.__type || JSON.stringify(data);
      throw new Error(`AWS Athena Error (${status}): ${message}`);
    }
  } else if (error.request) {
    throw new Error('No response from AWS Athena API. Check your internet connection and region.');
  } else {
    throw error;
  }
}

// ============================================================
// QUERIES
// ============================================================

export async function startQuery({ sql, database, workgroup, outputLocation }) {
  const body = {
    QueryString: sql,
    ...(database && { QueryExecutionContext: { Database: database } }),
    ...(workgroup && { WorkGroup: workgroup }),
    ...(outputLocation && { ResultConfiguration: { OutputLocation: outputLocation } })
  };
  const data = await athenaRequest('StartQueryExecution', body);
  return data;
}

export async function getQuery(queryExecutionId) {
  const data = await athenaRequest('GetQueryExecution', { QueryExecutionId: queryExecutionId });
  return data?.QueryExecution || null;
}

export async function listQueries(workgroup) {
  const body = {};
  if (workgroup) body.WorkGroup = workgroup;
  const data = await athenaRequest('ListQueryExecutions', body);
  return data?.QueryExecutionIds || [];
}

export async function stopQuery(queryExecutionId) {
  await athenaRequest('StopQueryExecution', { QueryExecutionId: queryExecutionId });
  return { stopped: true };
}

export async function getQueryResults(queryExecutionId, maxResults = 20) {
  const data = await athenaRequest('GetQueryResults', {
    QueryExecutionId: queryExecutionId,
    MaxResults: maxResults
  });
  return data;
}

// ============================================================
// DATABASES
// ============================================================

export async function listDatabases(catalogName = 'AwsDataCatalog') {
  const data = await athenaRequest('ListDatabases', { CatalogName: catalogName });
  return data?.DatabaseList || [];
}

export async function getDatabase(catalogName, databaseName) {
  const data = await athenaRequest('GetDatabase', {
    CatalogName: catalogName || 'AwsDataCatalog',
    DatabaseName: databaseName
  });
  return data?.Database || null;
}

export async function createDatabase({ catalogName, databaseName, description, outputLocation }) {
  // Athena creates databases via DDL query
  const sql = description
    ? `CREATE DATABASE IF NOT EXISTS ${databaseName} COMMENT '${description}'`
    : `CREATE DATABASE IF NOT EXISTS ${databaseName}`;
  return await startQuery({ sql, outputLocation });
}

// ============================================================
// WORKGROUPS
// ============================================================

export async function listWorkgroups() {
  const data = await athenaRequest('ListWorkGroups', {});
  return data?.WorkGroups || [];
}

export async function getWorkgroup(workgroupName) {
  const data = await athenaRequest('GetWorkGroup', { WorkGroup: workgroupName });
  return data?.WorkGroup || null;
}

export async function createWorkgroup({ name, description, outputLocation }) {
  const body = {
    Name: name,
    ...(description && { Description: description }),
    ...(outputLocation && {
      Configuration: {
        ResultConfiguration: { OutputLocation: outputLocation }
      }
    })
  };
  const data = await athenaRequest('CreateWorkGroup', body);
  return data || { created: true };
}
