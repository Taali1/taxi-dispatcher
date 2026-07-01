import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import mysql from "npm:mysql2@3.6.5/promise";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DatabaseConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
}

interface RequestBody {
  action: "test" | "query" | "tables" | "structure";
  config: DatabaseConfig;
  sql?: string;
  params?: unknown[];
  table?: string;
}

async function createConnection(config: DatabaseConfig) {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    password: config.password,
    database: config.database,
    connectTimeout: 10000,
  });
  return connection;
}

async function testConnection(config: DatabaseConfig) {
  let connection;
  try {
    connection = await createConnection(config);
    const [rows] = await connection.query("SELECT 1 as test");

    const [versionRows] = await connection.query("SELECT VERSION() as version");
    const version = (versionRows as { version: string }[])[0]?.version || "Unknown";

    const [tableRows] = await connection.query("SHOW TABLES");
    const tables = (tableRows as Record<string, string>[]).map(row => Object.values(row)[0]);

    return {
      success: true,
      data: {
        connected: true,
        version,
        tables,
        tableCount: tables.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed"
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function executeQuery(config: DatabaseConfig, sql: string, params?: unknown[]) {
  let connection;
  try {
    connection = await createConnection(config);

    const [rows, fields] = await connection.query(sql, params);

    const isSelect = sql.trim().toUpperCase().startsWith("SELECT") ||
                     sql.trim().toUpperCase().startsWith("SHOW");

    if (isSelect) {
      return {
        success: true,
        data: rows,
        rowCount: Array.isArray(rows) ? rows.length : 0,
        fields: fields ? (fields as { name: string }[]).map(f => f.name) : []
      };
    }

    const result = rows as { affectedRows?: number; insertId?: number };
    return {
      success: true,
      data: null,
      affectedRows: result.affectedRows || 0,
      insertId: result.insertId || null
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Query execution failed"
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

async function getTables(config: DatabaseConfig) {
  return executeQuery(config, "SHOW TABLES");
}

async function getTableStructure(config: DatabaseConfig, table: string) {
  let connection;
  try {
    connection = await createConnection(config);

    const [columns] = await connection.query(`DESCRIBE ${table}`);
    const [indexes] = await connection.query(`SHOW INDEX FROM ${table}`);
    const [createTable] = await connection.query(`SHOW CREATE TABLE ${table}`);

    return {
      success: true,
      data: {
        columns,
        indexes,
        createStatement: (createTable as { "Create Table": string }[])[0]?.["Create Table"]
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to get table structure"
    };
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { action, config, sql, params, table } = body;

    console.log("[database-proxy] Request received:", {
      action,
      config: config ? {
        host: config.host,
        port: config.port,
        user: config.user,
        database: config.database,
        hasPassword: !!config.password
      } : null,
      sql: sql ? sql.substring(0, 100) : null
    });

    if (!config || !config.host || !config.user || !config.database) {
      console.error("[database-proxy] Missing config:", { config });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required database configuration (host, user, database)"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    let result;

    switch (action) {
      case "test":
        result = await testConnection(config);
        break;

      case "query":
        if (!sql) {
          return new Response(
            JSON.stringify({ success: false, error: "SQL query is required" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        }
        result = await executeQuery(config, sql, params);
        break;

      case "tables":
        result = await getTables(config);
        break;

      case "structure":
        if (!table) {
          return new Response(
            JSON.stringify({ success: false, error: "Table name is required" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        }
        result = await getTableStructure(config, table);
        break;

      default:
        return new Response(
          JSON.stringify({ success: false, error: "Invalid action" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          }
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
