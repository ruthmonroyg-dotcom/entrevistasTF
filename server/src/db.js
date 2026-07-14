import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  timezone: 'Z',
});

// --- Helpers de consulta (envuelven mysql2 con una API simple, parecida a la que
// se usaba con better-sqlite3, pero asíncrona) ---

// Devuelve todas las filas.
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Devuelve la primera fila o undefined.
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0];
}

// Para INSERT/UPDATE/DELETE. Devuelve { insertId, affectedRows }.
export async function run(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return { insertId: result.insertId, affectedRows: result.affectedRows };
}

// Ejecuta un bloque de operaciones dentro de una transacción real de MySQL.
// El callback recibe un objeto { query, queryOne, run } que opera sobre la
// misma conexión/transacción (no sobre el pool general).
export async function transaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const scoped = {
      query: async (sql, params = []) => (await conn.query(sql, params))[0],
      queryOne: async (sql, params = []) => {
        const [rows] = await conn.query(sql, params);
        return rows[0];
      },
      run: async (sql, params = []) => {
        const [result] = await conn.query(sql, params);
        return { insertId: result.insertId, affectedRows: result.affectedRows };
      },
    };
    const result = await callback(scoped);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Crea las tablas si no existen (orden pensado para evitar dependencias
// circulares de llaves foráneas entre candidates <-> slots).
export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date VARCHAR(10) NOT NULL,
      start_time VARCHAR(5) NOT NULL,
      end_time VARCHAR(5) NOT NULL,
      zoom_link VARCHAR(500) NOT NULL,
      zoom_meeting_id VARCHAR(50) NULL,
      zoom_password VARCHAR(50) NULL,
      is_available TINYINT(1) NOT NULL DEFAULT 1,
      candidate_id INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_slots_date (date, start_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      token VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      slot_id INT NULL,
      invited_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_candidates_slot FOREIGN KEY (slot_id) REFERENCES slots(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // La FK de slots.candidate_id se agrega en un segundo paso, ya que candidates
  // no existía todavía cuando se creó la tabla slots. Se ignora el error si ya existe
  // (por ejemplo, en reinicios posteriores del servidor).
  try {
    await pool.query(`
      ALTER TABLE slots
      ADD CONSTRAINT fk_slots_candidate FOREIGN KEY (candidate_id) REFERENCES candidates(id);
    `);
  } catch (err) {
    if (err.code !== 'ER_FK_DUP_NAME' && err.code !== 'ER_DUP_KEYNAME') {
      // Cualquier otro error sí es real y debe verse en los logs, pero no debe
      // tumbar el arranque del servidor si la constraint ya existía.
      console.warn('[db] Nota al agregar FK slots.candidate_id (probablemente ya existía):', err.message);
    }
  }
}

await initSchema();
console.log(`[db] Conectado a MySQL: ${process.env.DB_HOST || 'localhost'}/${process.env.DB_NAME}`);
