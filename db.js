const sql = require('mssql');

const config = {
  user: 'lucho',
  password: 'Asambleas123',
  server: 'localhost',  // o la IP/nombre de tu servidor
  database: 'Asamblea',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

async function connectDB() {
  try {
    await sql.connect(config);
    console.log('Conectado a SQL Server');
  } catch (error) {
    console.error('Error al conectar a SQL Server:', error);
  }
}

connectDB();

module.exports = sql;
