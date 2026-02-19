import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig, setConfig, getAllConfig, isConfigured } from './config.js';
import {
  startQuery,
  getQuery,
  listQueries,
  stopQuery,
  getQueryResults,
  listDatabases,
  getDatabase,
  createDatabase,
  listWorkgroups,
  getWorkgroup,
  createWorkgroup
} from './api.js';

const program = new Command();

// ============================================================
// Helpers
// ============================================================

function printSuccess(message) {
  console.log(chalk.green('✓') + ' ' + message);
}

function printError(message) {
  console.error(chalk.red('✗') + ' ' + message);
}

function printTable(data, columns) {
  if (!data || data.length === 0) {
    console.log(chalk.yellow('No results found.'));
    return;
  }

  const widths = {};
  columns.forEach(col => {
    widths[col.key] = col.label.length;
    data.forEach(row => {
      const val = String(col.format ? col.format(row[col.key], row) : (row[col.key] ?? ''));
      if (val.length > widths[col.key]) widths[col.key] = val.length;
    });
    widths[col.key] = Math.min(widths[col.key], 40);
  });

  const header = columns.map(col => col.label.padEnd(widths[col.key])).join('  ');
  console.log(chalk.bold(chalk.cyan(header)));
  console.log(chalk.dim('─'.repeat(header.length)));

  data.forEach(row => {
    const line = columns.map(col => {
      const val = String(col.format ? col.format(row[col.key], row) : (row[col.key] ?? ''));
      return val.substring(0, widths[col.key]).padEnd(widths[col.key]);
    }).join('  ');
    console.log(line);
  });

  console.log(chalk.dim(`\n${data.length} result(s)`));
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

async function withSpinner(message, fn) {
  const spinner = ora(message).start();
  try {
    const result = await fn();
    spinner.stop();
    return result;
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

function requireAuth() {
  if (!isConfigured()) {
    printError('AWS credentials not configured.');
    console.log('\nRun the following to configure:');
    console.log(chalk.cyan('  awsathena config set accessKeyId YOUR_KEY'));
    console.log(chalk.cyan('  awsathena config set secretAccessKey YOUR_SECRET'));
    console.log(chalk.cyan('  awsathena config set region us-east-1'));
    process.exit(1);
  }
}

// ============================================================
// Program metadata
// ============================================================

program
  .name('awsathena')
  .description(chalk.bold('Amazon Athena CLI') + ' - Run queries and manage databases from your terminal')
  .version('1.0.0');

// ============================================================
// CONFIG
// ============================================================

const configCmd = program.command('config').description('Manage CLI configuration');

configCmd
  .command('get <key>')
  .description('Get a configuration value')
  .action((key) => {
    const value = getConfig(key);
    if (value === undefined) {
      printError(`Key '${key}' not found`);
    } else {
      console.log(value);
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action((key, value) => {
    setConfig(key, value);
    printSuccess(`Config '${key}' set`);
  });

configCmd
  .command('list')
  .description('List all configuration values')
  .action(() => {
    const all = getAllConfig();
    console.log(chalk.bold('\nAmazon Athena CLI Configuration\n'));
    if (Object.keys(all).length === 0) {
      console.log(chalk.yellow('No configuration set.'));
      console.log('\nRun:');
      console.log(chalk.cyan('  awsathena config set accessKeyId YOUR_KEY'));
      console.log(chalk.cyan('  awsathena config set secretAccessKey YOUR_SECRET'));
      console.log(chalk.cyan('  awsathena config set region us-east-1'));
    } else {
      Object.entries(all).forEach(([k, v]) => {
        const displayVal = k === 'secretAccessKey' ? chalk.green('*'.repeat(8)) : chalk.cyan(String(v));
        console.log(`${k}: ${displayVal}`);
      });
    }
  });

// ============================================================
// QUERIES
// ============================================================

const queriesCmd = program.command('queries').description('Run and manage Athena queries');

queriesCmd
  .command('run')
  .description('Run a SQL query')
  .requiredOption('--sql <sql>', 'SQL query to execute')
  .option('--database <db>', 'Database to query')
  .option('--workgroup <wg>', 'Workgroup to use')
  .option('--output <s3-path>', 'S3 output location (e.g. s3://bucket/prefix/)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const result = await withSpinner('Starting query...', () =>
        startQuery({
          sql: options.sql,
          database: options.database,
          workgroup: options.workgroup,
          outputLocation: options.output
        })
      );

      if (options.json) {
        printJson(result);
        return;
      }

      printSuccess('Query started');
      console.log('Execution ID: ', chalk.cyan(result?.QueryExecutionId || JSON.stringify(result)));
      console.log('\nUse this ID to check status or get results:');
      console.log(chalk.dim(`  awsathena queries get ${result?.QueryExecutionId}`));
      console.log(chalk.dim(`  awsathena queries results ${result?.QueryExecutionId}`));
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

queriesCmd
  .command('get <execution-id>')
  .description('Get query execution status')
  .option('--json', 'Output as JSON')
  .action(async (executionId, options) => {
    requireAuth();
    try {
      const query = await withSpinner('Fetching query status...', () => getQuery(executionId));

      if (!query) {
        printError('Query execution not found');
        process.exit(1);
      }

      if (options.json) {
        printJson(query);
        return;
      }

      const state = query.Status?.State;
      const stateColor = state === 'SUCCEEDED' ? chalk.green : state === 'FAILED' ? chalk.red : chalk.yellow;

      console.log(chalk.bold('\nQuery Execution Details\n'));
      console.log('Execution ID:  ', chalk.cyan(query.QueryExecutionId));
      console.log('Status:        ', stateColor(state || 'N/A'));
      console.log('Query:         ', (query.Query || '').substring(0, 80));
      console.log('Database:      ', query.QueryExecutionContext?.Database || 'N/A');
      console.log('Workgroup:     ', query.WorkGroup || 'N/A');
      console.log('Output:        ', query.ResultConfiguration?.OutputLocation || 'N/A');
      if (query.Status?.StateChangeReason) {
        console.log('Reason:        ', chalk.red(query.Status.StateChangeReason));
      }
      if (query.Statistics) {
        console.log('Data Scanned:  ', query.Statistics.DataScannedInBytes ? `${(query.Statistics.DataScannedInBytes / 1024 / 1024).toFixed(2)} MB` : 'N/A');
        console.log('Exec Time:     ', query.Statistics.TotalExecutionTimeInMillis ? `${query.Statistics.TotalExecutionTimeInMillis}ms` : 'N/A');
      }
      console.log('');
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

queriesCmd
  .command('list')
  .description('List recent query executions')
  .option('--workgroup <wg>', 'Filter by workgroup')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const ids = await withSpinner('Fetching query list...', () => listQueries(options.workgroup));

      if (options.json) {
        printJson(ids);
        return;
      }

      if (!ids || ids.length === 0) {
        console.log(chalk.yellow('No query executions found.'));
        return;
      }

      console.log(chalk.bold('\nRecent Query Executions\n'));
      ids.forEach((id, i) => {
        console.log(`${chalk.dim(String(i + 1).padStart(3, ' '))}. ${chalk.cyan(id)}`);
      });
      console.log(chalk.dim(`\n${ids.length} execution(s)`));
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

queriesCmd
  .command('stop <execution-id>')
  .description('Stop a running query')
  .action(async (executionId) => {
    requireAuth();
    try {
      await withSpinner(`Stopping query ${executionId}...`, () => stopQuery(executionId));
      printSuccess(`Query ${executionId} stopped`);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

queriesCmd
  .command('results <execution-id>')
  .description('Get query results')
  .option('--limit <n>', 'Maximum number of rows', '20')
  .option('--json', 'Output as JSON')
  .action(async (executionId, options) => {
    requireAuth();
    try {
      const results = await withSpinner('Fetching query results...', () =>
        getQueryResults(executionId, parseInt(options.limit))
      );

      if (options.json) {
        printJson(results);
        return;
      }

      if (!results?.ResultSet?.Rows || results.ResultSet.Rows.length === 0) {
        console.log(chalk.yellow('No results found.'));
        return;
      }

      const rows = results.ResultSet.Rows;
      const header = rows[0]?.Data?.map(d => d.VarCharValue || '') || [];
      const dataRows = rows.slice(1);

      // Print header
      const headerLine = header.map(h => h.padEnd(20)).join('  ');
      console.log(chalk.bold(chalk.cyan(headerLine)));
      console.log(chalk.dim('─'.repeat(headerLine.length)));

      // Print rows
      dataRows.forEach(row => {
        const line = (row.Data || []).map(d => (d.VarCharValue || '').substring(0, 20).padEnd(20)).join('  ');
        console.log(line);
      });

      console.log(chalk.dim(`\n${dataRows.length} row(s)`));
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// DATABASES
// ============================================================

const databasesCmd = program.command('databases').description('Manage Athena databases');

databasesCmd
  .command('list')
  .description('List databases in the data catalog')
  .option('--catalog <name>', 'Data catalog name', 'AwsDataCatalog')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const databases = await withSpinner('Fetching databases...', () =>
        listDatabases(options.catalog)
      );

      if (options.json) {
        printJson(databases);
        return;
      }

      printTable(databases, [
        { key: 'Name', label: 'Name' },
        { key: 'Description', label: 'Description' },
        { key: 'Parameters', label: 'Parameters', format: (v) => v ? Object.keys(v).join(', ') : '' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

databasesCmd
  .command('get <database-name>')
  .description('Get database details')
  .option('--catalog <name>', 'Data catalog name', 'AwsDataCatalog')
  .option('--json', 'Output as JSON')
  .action(async (databaseName, options) => {
    requireAuth();
    try {
      const db = await withSpinner(`Fetching database ${databaseName}...`, () =>
        getDatabase(options.catalog, databaseName)
      );

      if (!db) {
        printError('Database not found');
        process.exit(1);
      }

      if (options.json) {
        printJson(db);
        return;
      }

      console.log(chalk.bold('\nDatabase Details\n'));
      console.log('Name:          ', chalk.cyan(db.Name));
      console.log('Description:   ', db.Description || 'N/A');
      if (db.Parameters) {
        console.log('Parameters:    ', JSON.stringify(db.Parameters));
      }
      console.log('');
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

databasesCmd
  .command('create <database-name>')
  .description('Create a new database (via DDL query)')
  .option('--description <desc>', 'Database description')
  .option('--output <s3-path>', 'S3 output location for query results')
  .option('--json', 'Output as JSON')
  .action(async (databaseName, options) => {
    requireAuth();
    try {
      const result = await withSpinner(`Creating database ${databaseName}...`, () =>
        createDatabase({
          databaseName,
          description: options.description,
          outputLocation: options.output
        })
      );

      if (options.json) {
        printJson(result);
        return;
      }

      printSuccess(`Database creation query started`);
      console.log('Execution ID: ', chalk.cyan(result?.QueryExecutionId || 'N/A'));
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// WORKGROUPS
// ============================================================

const workgroupsCmd = program.command('workgroups').description('Manage Athena workgroups');

workgroupsCmd
  .command('list')
  .description('List workgroups')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();
    try {
      const workgroups = await withSpinner('Fetching workgroups...', () => listWorkgroups());

      if (options.json) {
        printJson(workgroups);
        return;
      }

      printTable(workgroups, [
        { key: 'Name', label: 'Name' },
        { key: 'State', label: 'State' },
        { key: 'Description', label: 'Description' },
        { key: 'CreationTime', label: 'Created', format: (v) => v ? new Date(v).toLocaleDateString() : '' }
      ]);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

workgroupsCmd
  .command('get <workgroup-name>')
  .description('Get workgroup details')
  .option('--json', 'Output as JSON')
  .action(async (workgroupName, options) => {
    requireAuth();
    try {
      const wg = await withSpinner(`Fetching workgroup ${workgroupName}...`, () =>
        getWorkgroup(workgroupName)
      );

      if (!wg) {
        printError('Workgroup not found');
        process.exit(1);
      }

      if (options.json) {
        printJson(wg);
        return;
      }

      console.log(chalk.bold('\nWorkgroup Details\n'));
      console.log('Name:          ', chalk.cyan(wg.Name));
      console.log('State:         ', wg.State || 'N/A');
      console.log('Description:   ', wg.Description || 'N/A');
      console.log('Created:       ', wg.CreationTime ? new Date(wg.CreationTime).toLocaleString() : 'N/A');
      const output = wg.Configuration?.ResultConfiguration?.OutputLocation;
      if (output) console.log('Output S3:     ', output);
      console.log('');
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

workgroupsCmd
  .command('create <workgroup-name>')
  .description('Create a new workgroup')
  .option('--description <desc>', 'Workgroup description')
  .option('--output <s3-path>', 'Default S3 output location')
  .option('--json', 'Output as JSON')
  .action(async (workgroupName, options) => {
    requireAuth();
    try {
      const result = await withSpinner(`Creating workgroup ${workgroupName}...`, () =>
        createWorkgroup({
          name: workgroupName,
          description: options.description,
          outputLocation: options.output
        })
      );

      if (options.json) {
        printJson(result);
        return;
      }

      printSuccess(`Workgroup '${workgroupName}' created`);
    } catch (error) {
      printError(error.message);
      process.exit(1);
    }
  });

// ============================================================
// Parse
// ============================================================

program.parse(process.argv);

if (process.argv.length <= 2) {
  program.help();
}
