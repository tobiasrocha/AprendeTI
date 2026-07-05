import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'app.db')

let db

export function getDb() {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function initDb() {
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT NOT NULL,
      username TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_user ON login_attempts(username, created_at);

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#3b82f6',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS formats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      extensions TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS webauthn_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      public_key_pem TEXT NOT NULL,
      sign_count INTEGER NOT NULL DEFAULT 0,
      device_name TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      shared_with_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, shared_with_user_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_groups (
      user_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, group_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS document_group_shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, group_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      content TEXT DEFAULT '',
      format TEXT NOT NULL DEFAULT 'md' CHECK(format IN ('pdf','html','docx','md','txt')),
      filename TEXT,
      original_name TEXT,
      file_size INTEGER DEFAULT 0,
      user_id INTEGER NOT NULL,
      category_id INTEGER,
      parent_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE SET NULL
    );
  `)

  const tableSQL = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'").get()
  if (tableSQL && !tableSQL.sql.includes("'image'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;
      CREATE TABLE documents_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        content TEXT DEFAULT '',
        format TEXT NOT NULL DEFAULT 'md' CHECK(format IN ('pdf','html','docx','md','txt','image')),
        filename TEXT,
        original_name TEXT,
        file_size INTEGER DEFAULT 0,
        user_id INTEGER NOT NULL,
        category_id INTEGER,
        parent_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE SET NULL
      );
      INSERT INTO documents_migrated SELECT * FROM documents;
      DROP TABLE documents;
      ALTER TABLE documents_migrated RENAME TO documents;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `)
    console.log('Tabela documents migrada para incluir formato image')
  }

  for (const col of ['category_id', 'parent_id']) {
    try { db.exec(`ALTER TABLE documents ADD COLUMN ${col} INTEGER REFERENCES ${col === 'parent_id' ? 'documents(id) ON DELETE SET NULL' : 'categories(id) ON DELETE SET NULL'}`) } catch (_) {}
  }

  try { db.exec('CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id)') } catch (_) {}

  const adminUser = process.env.ADMIN_USER || 'admin'
  const adminPass = process.env.ADMIN_PASS
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@aprendeti.local'
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser)
  if (!adminExists) {
    if (!adminPass) {
      console.log('ADMIN_PASS nao definido. Pulando criacao do admin.')
    } else {
      const hash = bcrypt.hashSync(adminPass, 12)
      db.prepare('INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)').run(
        adminUser, adminEmail, hash, 'admin'
      )
      console.log(`Usuario admin criado (${adminUser})`)
    }
  }

  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c
  if (catCount === 0) {
    const cats = [
      ['Infraestrutura de TI', 'Servidores, redes, bancos e monitoramento', '#3b82f6'],
      ['Desenvolvimento Web', 'APIs, frontend, frameworks e deploy', '#22c55e'],
      ['AI-Assisted Dev', 'Ferramentas e tecnicas de IA no desenvolvimento', '#8b5cf6'],
    ]
    const insert = db.prepare('INSERT INTO categories (name, description, color) VALUES (?, ?, ?)')
    for (const c of cats) insert.run(...c)
    console.log('Categorias padrao criadas')
  }

  const fmtCount = db.prepare('SELECT COUNT(*) as c FROM formats').get().c
  if (fmtCount === 0) {
      const fmts = [
        ['Markdown', 'Documentos em formato Markdown', 'md,markdown'],
        ['HTML', 'Documentos em formato HTML', 'html,htm'],
        ['PDF', 'Documentos PDF', 'pdf'],
        ['DOCX', 'Documentos Microsoft Word', 'docx'],
        ['Texto', 'Documentos de texto puro', 'txt'],
        ['Imagem', 'Imagens JPG e PNG', 'jpg,jpeg,png'],
      ]
    const insertFmt = db.prepare('INSERT INTO formats (name, description, extensions) VALUES (?, ?, ?)')
    for (const f of fmts) insertFmt.run(...f)
    console.log('Formatos padrao criados')
  }

  const groupCount = db.prepare('SELECT COUNT(*) as c FROM groups').get().c
  if (groupCount === 0) {
    const groups = [
      ['Admin', 'Administradores do sistema'],
      ['Usuario Comum', 'Usuarios padrao com acesso basico'],
    ]
    const insertGroup = db.prepare('INSERT INTO groups (name, description) VALUES (?, ?)')
    for (const g of groups) insertGroup.run(...g)
    console.log('Grupos padrao criados')
  }
}
