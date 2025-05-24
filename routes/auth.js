// routes/auth.js
const express = require('express');
const router = express.Router();
const sql = require('mssql');
const bcrypt = require('bcrypt');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await sql.query(`
      SELECT u.username, u.Password, r.NombreRol
      FROM InicioSesionUsuario u
      INNER JOIN Roles r ON u.IdRol = r.IdRol
      WHERE u.username = @username
    `, {
      input: {
        username: sql.VarChar
      }
    });

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: 'Usuario no encontrado' });
    }

    const user = result.recordset[0];
    const match = await bcrypt.compare(password, user.Password);

    if (!match) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    // Autenticación exitosa
    return res.status(200).json({
      message: 'Inicio de sesión exitoso',
      username: user.username,
      rol: user.NombreRol
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Error en el servidor' });
  }
});

module.exports = router;
