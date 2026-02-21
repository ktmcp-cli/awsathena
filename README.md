> "Six months ago, everyone was talking about MCPs. And I was like, screw MCPs. Every MCP would be better as a CLI."
>
> — [Peter Steinberger](https://twitter.com/steipete), Founder of OpenClaw
> [Watch on YouTube (~2:39:00)](https://www.youtube.com/@lexfridman) | [Lex Fridman Podcast #491](https://lexfridman.com/peter-steinberger/)

# Amazon Athena CLI

Production-ready CLI for the Amazon Athena Query API. Run SQL queries and manage databases and workgroups directly from your terminal.

## Installation

```bash
npm install -g @ktmcp-cli/awsathena
```

## Configuration

```bash
awsathena config set accessKeyId YOUR_AWS_ACCESS_KEY_ID
awsathena config set secretAccessKey YOUR_AWS_SECRET_ACCESS_KEY
awsathena config set region us-east-1
```

## Usage

### Queries

```bash
# Run a SQL query
awsathena queries run --sql "SELECT * FROM my_table LIMIT 10" --database my_db --output s3://my-bucket/results/

# Check query status
awsathena queries get <execution-id>

# List recent queries
awsathena queries list
awsathena queries list --workgroup primary

# Stop a running query
awsathena queries stop <execution-id>

# Get query results
awsathena queries results <execution-id>
awsathena queries results <execution-id> --limit 100
```

### Databases

```bash
# List all databases
awsathena databases list
awsathena databases list --catalog AwsDataCatalog

# Get database details
awsathena databases get my_database

# Create a database
awsathena databases create new_database --output s3://my-bucket/results/
```

### Workgroups

```bash
# List workgroups
awsathena workgroups list

# Get workgroup details
awsathena workgroups get primary

# Create a workgroup
awsathena workgroups create my-team --description "My team workgroup" --output s3://my-bucket/results/
```

### JSON Output

All commands support `--json`:

```bash
awsathena queries get <id> --json
awsathena databases list --json | jq '.[].Name'
awsathena queries results <id> --json
```

## License

MIT


---

## Support KTMCP

If you find this CLI useful, we'd greatly appreciate your support! Share your experience on:
- Reddit
- Twitter/X
- Hacker News

**Incentive:** Users who can demonstrate that their support/advocacy helped advance KTMCP will have their feature requests and issues prioritized.

Just be mindful - these are real accounts and real communities. Authentic mentions and genuine recommendations go a long way!

## Support This Project

If you find this CLI useful, we'd appreciate support across Reddit, Twitter, Hacker News, or Moltbook. Please be mindful - these are real community accounts. Contributors who can demonstrate their support helped advance KTMCP will have their PRs and feature requests prioritized.
