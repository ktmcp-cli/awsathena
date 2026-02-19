# AGENT.md — Amazon Athena CLI for AI Agents

This document explains how to use the Amazon Athena CLI as an AI agent.

## Overview

The `awsathena` CLI provides access to the Amazon Athena Query API. Requires AWS credentials with Athena permissions.

## Prerequisites

```bash
awsathena config set accessKeyId YOUR_AWS_ACCESS_KEY_ID
awsathena config set secretAccessKey YOUR_AWS_SECRET_ACCESS_KEY
awsathena config set region us-east-1
```

## All Commands

### Config

```bash
awsathena config get <key>
awsathena config set <key> <value>
awsathena config list
```

### Queries

```bash
# Run query
awsathena queries run --sql "SELECT * FROM table LIMIT 10" --database my_db --output s3://bucket/results/
awsathena queries run --sql "SELECT count(*) FROM table" --workgroup primary

# Check status
awsathena queries get <execution-id>

# List recent queries
awsathena queries list
awsathena queries list --workgroup primary

# Stop query
awsathena queries stop <execution-id>

# Get results
awsathena queries results <execution-id>
awsathena queries results <execution-id> --limit 100
```

### Databases

```bash
awsathena databases list
awsathena databases list --catalog AwsDataCatalog
awsathena databases get <database-name>
awsathena databases create <database-name> --output s3://bucket/results/
```

### Workgroups

```bash
awsathena workgroups list
awsathena workgroups get <workgroup-name>
awsathena workgroups create <name> --description "desc" --output s3://bucket/results/
```

## JSON Output

All commands support `--json`:

```bash
awsathena queries get <id> --json
awsathena databases list --json
awsathena workgroups list --json
```

## Typical Workflow

```bash
# 1. Start a query
awsathena queries run --sql "SELECT * FROM my_db.my_table LIMIT 100" --output s3://my-bucket/results/

# 2. Check status (wait for SUCCEEDED)
awsathena queries get <execution-id>

# 3. Get results
awsathena queries results <execution-id> --json
```

## Error Handling

The CLI exits with code 1 on error and prints to stderr.
- `AWS authentication failed` — Check accessKeyId and secretAccessKey
- `Resource not found` — Check query execution ID or resource name
