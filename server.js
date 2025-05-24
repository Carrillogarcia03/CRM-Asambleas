const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const app = express();
const path = require('path');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'Fronted')));
// Configuración de conexión
const config = {
  user: 'lucho',
  password: 'Asambleas123',
  server: 'localhost',
  database: 'Asamblea',
  options: {
    encrypt: false,
    trustServerCertificate: true
  }
};

// Ruta de login
app.post('/login', async (req, res) => {
  const { usuario, contrasena } = req.body;

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
       .input('usuario', sql.VarChar, usuario)
  .input('contrasena', sql.VarChar, contrasena)
  .query(`
    SELECT username, password, idrolfk 
    FROM iniciosesionusuario 
    WHERE CAST(username AS VARCHAR(255)) = @usuario 
      AND CAST(password AS VARCHAR(255)) = @contrasena
  `);
    if (result.recordset.length > 0) {
      const rol = result.recordset[0].idrolfk;

      if (rol === 1) {
        res.json({ success: true, rol: 'administrador', redirectUrl: '/Home.html' });
      } else {
        res.json({ success: true, rol: 'usuario', redirectUrl: '/User-home.html' });
      }
    } else {
      res.json({ success: false, message: 'Credenciales incorrectas' });
    }
  } catch (err) {
    console.error('Error en la consulta SQL:', err);
    res.status(500).json({ success: false, message: 'No mi ciela tu servidor no la da :V' });
  }
});

// Servidor escuchando en puerto 3000
const port = 3000;
app.listen(port, () => {
  console.log(`La que se conecto al servidor en http://localhost:${port}`);
});


