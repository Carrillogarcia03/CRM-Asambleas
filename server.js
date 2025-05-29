const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const app = express();
const path = require('path');
const { Server } = require('socket.io');
const http    = require('http');
const server = http.createServer(app);
const socketIo = require('socket.io');
const io = socketIo(server);
const ExcelJS = require('exceljs');


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
app.get('/api/cliente/:documento', async (req, res) => {
  const { documento } = req.params;

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input('documento', sql.VarChar, documento)
      .query(`
        SELECT Documento, RazonSocial, RepresentanteLegal
        FROM clientes 
        WHERE documento = @documento
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('Error en la consulta SQL de cliente:', err);
    res.status(500).json({ message: 'Error en el servidor al consultar el cliente' });
  }
});
app.post('/api/mocion', async (req, res) => {
  const {
    preguntaVotada,
    tipoMocion,
    descripcion,
    fechaProgramacion,
    documentoCliente,
    modalidades
  } = req.body;

  // Validaciones básicas
  if (!preguntaVotada || !tipoMocion || !descripcion || !fechaProgramacion || !documentoCliente) {
    return res.status(400).json({ message: 'Faltan datos obligatorios' });
  }

  try {
    const pool = await sql.connect(config);

    // 1) Inserta en Asamblea y captura IdAsamblea
    const modalidadesStr = modalidades.join(', ');
    const insertAsambleaQuery = `
      INSERT INTO Asamblea (AsuntoAsamblea, DocumentoCliente, FechaProgramada, Modalidad, Estado)
      OUTPUT INSERTED.IdAsamblea
      VALUES (@asunto, @docCli, @fechaProg, @modal, @estado);
    `;
    const asRes = await pool.request()
      .input('asunto', sql.VarChar, preguntaVotada)
      .input('docCli', sql.VarChar, documentoCliente)
      .input('fechaProg', sql.Date, fechaProgramacion)
      .input('modal', sql.VarChar, modalidadesStr)
      .input('estado', sql.VarChar, 'Pendiente') // o el estado que corresponda
      .query(insertAsambleaQuery);

    const idAsamblea = asRes.recordset[0].IdAsamblea;
    if (!idAsamblea) throw new Error('No se generó IdAsamblea');

    // 2) Inserta en Mocion usando ese IdAsamblea
    const insertMocionQuery = `
      INSERT INTO Mocion (PreguntaVotada, TipoMocion, Descripcion, IdAsambleaFk)
      VALUES (@pregunta, @tipo, @desc, @idA);
    `;
    await pool.request()
      .input('pregunta', sql.VarChar, preguntaVotada)
      .input('tipo', sql.VarChar, tipoMocion)
      .input('desc', sql.VarChar, descripcion)
      .input('idA', sql.Int, idAsamblea)
      .query(insertMocionQuery);

    // Responde con éxito
    res.json({ 
      message: 'Asamblea y Moción creadas correctamente', 
      idAsamblea 
    });

  } catch (err) {
    console.error('Error creando mocion y asamblea:', err);
    res.status(500).json({ message: err.message || 'Error en el servidor' });
  }
});

const multer = require('multer');


// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads')); // crea /uploads si no existe
  },
  filename: (req, file, cb) => {
    // para evitar colisiones
    const ts = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${ts}-${file.originalname}`);
  }
});

const upload = multer({ storage });

app.post('/api/mocion/:id/archivo', upload.single('archivo'), async (req, res) => {
  const idMocion = parseInt(req.params.id, 10);
  if (!req.file || isNaN(idMocion)) {
    return res.status(400).json({ message: 'Falta archivo o ID de moción inválido' });
  }

  try {
    const pool = await sql.connect(config);
    await pool.request()
      .input('nombre', sql.VarChar, req.file.originalname)
      .input('ruta',   sql.VarChar, req.file.filename)   // sólo el nombre, o la ruta completa
      .input('idMocion', sql.Int, idMocion)
      .query(`
        INSERT INTO ArchivosAdjuntos (NombreOriginal, RutaServidor, IdMocionFk)
        VALUES (@nombre, @ruta, @idMocion);
      `);

    res.json({ message: 'Archivo subido y guardado correctamente' });
  } catch (err) {
    console.error('Error al guardar metadata:', err);
    res.status(500).json({ message: 'Error guardando metadata del archivo' });
  }
});

app.get('/api/mocion', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .query(`
        SELECT IdMocion,
               PreguntaVotada,
               Descripcion,
               TipoMocion
        FROM Mocion
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Error obteniendo mociones:', err);
    res.status(500).json({ message: 'Error al leer mociones' });
  }
});



// PUT /api/mocion/:id
app.put('/api/mocion/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { preguntaVotada, descripcion } = req.body;
  if (isNaN(id) || !preguntaVotada || !descripcion) {
    return res.status(400).json({ message: 'ID, Pregunta y Descripción son obligatorios' });
  }
  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('pregunta', sql.VarChar, preguntaVotada)
      .input('descripcion', sql.VarChar, descripcion)
      .query(`
        UPDATE Mocion
        SET PreguntaVotada = @pregunta,
            Descripcion    = @descripcion
        WHERE IdMocion = @id
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Moción no encontrada' });
    }
    res.json({ message: 'Moción actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error actualizando moción' });
  }
});
app.delete('/api/mocion/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido' });
  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM Mocion WHERE IdMocion = @id');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'Moción no encontrada' });
    }
    res.json({ message: 'Moción eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar moción:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});
app.post('/api/mocion/ejecutar/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ message: 'ID inválido' });

  try {
    // 1) Marca la moción como “activa” en la BD, si lo deseas
    const pool = await sql.connect(config);
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE Mocion SET Activa = 1 WHERE IdMocion = @id`);

    // 2) Obtén la info de la moción
    const { recordset } = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT IdMocion, PreguntaVotada FROM Mocion WHERE IdMocion = @id`);

    const mocion = recordset[0];

    // 3) Emite a todos los clientes conectados
    io.emit('nueva_mocion', { id: mocion.IdMocion, pregunta: mocion.PreguntaVotada });

    res.json({ message: 'Moción ejecutada', id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al ejecutar moción' });
  }
});

// Ruta para registrar un voto vía HTTP (por si mezclas)
app.post('/api/mocion/:id/votar', async (req, res) => {
  const id   = parseInt(req.params.id, 10);
  const { voto } = req.body; // 'si' | 'no' | 'blanco'
  try {
    const pool = await sql.connect(config);
    await pool.request()
      .input('id', sql.Int, id)
      .input('voto', sql.VarChar, voto)
      .query(`INSERT INTO Votos (IdMocionFk, Voto) VALUES (@id, @voto)`);
    // luego emitimos el conteo
    const counts = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          SUM(CASE WHEN Voto='si' THEN 1 ELSE 0 END) AS si,
          SUM(CASE WHEN Voto='no' THEN 1 ELSE 0 END) AS no,
          SUM(CASE WHEN Voto='blanco' THEN 1 ELSE 0 END) AS blanco
        FROM Votos
        WHERE IdMocionFk = @id
      `);
    io.emit('nuevo_voto', { id, ...counts.recordset[0] });
    res.json({ message: 'Voto registrado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error registrando voto' });
  }
});

// Socket.io: recibir voto directo por WS
io.on('connection', (socket) => {
  console.log('Cliente conectado', socket.id);

  socket.on('votar', async ({ id, voto }) => {
    console.log(`Insertando en Votos: Mocion=${id}, Voto=${voto}`);
const pool = await sql.connect(config);
await pool.request()
  .input('id', sql.Int, id)
  .input('voto', sql.VarChar, voto)
  .query(`INSERT INTO Votos (IdMocionFk, Voto) VALUES (@id, @voto)`);
console.log('Inserción realizada.');
    console.log('Evento votar recibido en servidor:', id, voto);    
    try {
      const pool = await sql.connect(config);
      await pool.request()
|        .input('id', sql.Int, id)
        .input('voto', sql.VarChar, voto)
        .query(`INSERT INTO Votos (IdMocionFk, Voto) VALUES (@id, @voto)`);

      const counts = await pool.request()
        .input('id', sql.Int, id)
        .query(`
          SELECT 
            SUM(CASE WHEN Voto='si' THEN 1 ELSE 0 END) AS si,
            SUM(CASE WHEN Voto='no' THEN 1 ELSE 0 END) AS no,
            SUM(CASE WHEN Voto='blanco' THEN 1 ELSE 0 END) AS blanco
          FROM Votos
          WHERE IdMocionFk = @id
        `);
      io.emit('nuevo_voto', { id, ...counts.recordset[0] });
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado', socket.id);
  });

  // Finalizar votación
  socket.on('finalizar-votacion', async (idmocion) => {
    try {
      const pool = await sql.connect(config);

      const result = await pool.request()
        .input('idmocion', sql.Int, idmocion)
        .query(`
          SELECT 
            SUM(CASE WHEN voto = 'si' THEN 1 ELSE 0 END) AS total_si,
            SUM(CASE WHEN voto = 'no' THEN 1 ELSE 0 END) AS total_no,
            SUM(CASE WHEN voto = 'abstencion' THEN 1 ELSE 0 END) AS total_abstencion
          FROM votos
          WHERE idmocionfk = @idmocion
        `);

      const { total_si, total_no, total_abstencion } = result.recordset[0];

      // Insertar en resultados
      await pool.request()
        .input('idmocion', sql.Int, idmocion)
        .input('total_si', sql.Int, total_si)
        .input('total_no', sql.Int, total_no)
        .input('total_abstencion', sql.Int, total_abstencion)
        .query(`
          INSERT INTO resultados (idmocionfk, total_si, total_no, total_abstencion)
          VALUES (@idmocion, @total_si, @total_no, @total_abstencion)
        `);

      io.emit('votacion-finalizada', { total_si, total_no, total_abstencion });

    } catch (err) {
      console.error('Error al finalizar votación:', err);
      socket.emit('error-finalizando', 'Error al guardar los resultados');
    }
  });

  // GET /api/resultados/:idmocion
app.get('/api/resultados/:idmocion', async (req, res) => {
  const id = parseInt(req.params.idmocion, 10);
  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input('idmocion', sql.Int, id)
      .query(`
        SELECT total_si, total_no, total_abstencion
        FROM resultados
        WHERE idmocionfk = @idmocion
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ message: 'No hay resultados para esa moción' });
    }
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error obteniendo resultados' });
  }
});

});


// GET /api/reportes/mociones/excel
app.get('/api/reportes/mociones', async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const { recordset } = await pool.request()
      .query(`
        SELECT 
          m.IdMocion,
          m.PreguntaVotada,
          e.Fecha,  -- asumo que en 'resultados' guardas la fecha de cierre
          r.total_si,
          r.total_no,
          r.total_abstencion
        FROM Mocion m
        JOIN resultados r
          ON m.IdMocion = r.IdMocionFk
        JOIN resultados e
          ON m.IdMocion = e.IdMocionFk
        ORDER BY e.Fecha DESC
      `);

    // Calcula estado
    const data = recordset.map(row => {
      const { IdMocion, PreguntaVotada, Fecha, total_si, total_no, total_abstencion } = row;
      const aprobado = total_si > total_no + total_abstencion;
      return {
        IdMocion,
        PreguntaVotada,
        Fecha,
        aprobado: aprobado ? 'Aprobada' : 'Rechazada'
      };
    });

    res.json(data);
  } catch (err) {
    console.error('Error listando mociones:', err);
    res.status(500).json({ message: 'Error al obtener reporte de mociones' });
  }
});
// GET /api/reportes/mocion/:id/excel
app.get('/api/reportes/mocion/:id/excel', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    const pool = await sql.connect(config);

    // Trae detalles de la moción
    const moc = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT PreguntaVotada FROM Mocion WHERE IdMocion = @id`);
    if (!moc.recordset.length) return res.status(404).end();

    // Trae todos los votos de esa moción
    const votos = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT Voto, Fecha
        FROM Votos
        WHERE IdMocionFk = @id
        ORDER BY Fecha
      `);

    const resultado = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT total_si, total_no, total_abstencion, fecha
        FROM resultados
        WHERE IdMocionFk = @id
      `);

    // Genera Excel con ExcelJS
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Detalle Moción');

    // Cabecera con pregunta y fecha de cierre
    ws.addRow(['Pregunta:', moc.recordset[0].PreguntaVotada]);
    ws.addRow(['Fecha Cierre:', resultado.recordset[0].fecha]);
    ws.addRow([]);
    ws.addRow(['Votos Sí', resultado.recordset[0].total_si]);
    ws.addRow(['Votos No', resultado.recordset[0].total_no]);
    ws.addRow(['Abstenciones', resultado.recordset[0].total_abstencion]);
    ws.addRow([]);
    ws.addRow(['Historial de votos:']);
    ws.addRow(['Voto', 'Fecha']);
    votos.recordset.forEach(v => ws.addRow([v.Voto, v.Fecha]));

    // Headers HTTP
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Mocion_${id}_Detalle.xlsx"`
    );
    await wb.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Error generando Excel de moción:', err);
    res.status(500).json({ message: 'No se pudo generar Excel' });
  }
});
// Servidor escuchando en puerto 3000
const port = 3000;
server.listen(port, () => {
  console.log(`La que se conecto al servidor en http://localhost:${port}`);
});
