# Recorre a mano el flujo completo de pagos (US-006, US-007A, US-007B) contra un
# servidor ya levantado, usando la pasarela simulada. Crea sus propios datos con
# un sufijo aleatorio, así que puede ejecutarse varias veces seguidas.
#
#   . .\scripts\Use-Node.ps1                      # si necesitas npm en el PATH
#   powershell -ExecutionPolicy Bypass -File .\scripts\Probar-Pagos.ps1 `
#       -AdminUsuario admin@sage.local -AdminClave 'TuClave123!'
param(
    [string]$Api = 'http://localhost:3000/api/v1',
    [Parameter(Mandatory = $true)][string]$AdminUsuario,
    [Parameter(Mandatory = $true)][string]$AdminClave
)
$ErrorActionPreference = 'Stop'
$sufijo = -join ((48..57) + (97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
$claveInicial = 'InicialTemporal123!'
$clave = 'ApoderadoSeguro123!'

function Paso($texto) { Write-Host "`n== $texto" -ForegroundColor Cyan }
function Ok($texto) { Write-Host "   OK  $texto" -ForegroundColor Green }
function Mal($texto) { Write-Host "   MAL $texto" -ForegroundColor Red; exit 1 }
function Json($objeto) { $objeto | ConvertTo-Json -Depth 6 -Compress }
function EsperaError($codigo, $texto, $bloque) {
    try { & $bloque; Mal "$texto (no falló)" }
    catch {
        $real = $_.Exception.Response.StatusCode.value__
        if ($real -eq $codigo) { Ok $texto } else { Mal "$texto (esperaba $codigo, llegó $real)" }
    }
}

Paso 'Inicia sesión el administrador'
Invoke-RestMethod "$Api/auth/login" -Method Post -ContentType 'application/json' `
    -Body (Json @{ identificador = $AdminUsuario; contrasena = $AdminClave }) `
    -SessionVariable admin | Out-Null
Ok 'administrador autenticado'

Paso 'Crea la cuenta del apoderado y el estudiante a su cargo'
$cuenta = (Invoke-RestMethod "$Api/admin/usuarios" -Method Post -ContentType 'application/json' `
        -Body (Json @{
            identificador   = "apoderado-$sufijo@sage.local"
            numeroDocumento = "DOC-$sufijo"
            nombres         = 'Luis'
            apellidos       = "Apoderado$sufijo"
            contrasena      = $claveInicial
            roles           = @('APODERADO')
        }) -WebSession $admin).data
$estudiante = (Invoke-RestMethod "$Api/admin/estudiantes" -Method Post -ContentType 'application/json' `
        -Body (Json @{
            numeroDocumento = "EST-$sufijo"
            nombres         = 'Hijo'
            apellidos       = "Apoderado$sufijo"
        }) -WebSession $admin).data
Invoke-RestMethod "$Api/admin/apoderados/estudiantes" -Method Put -ContentType 'application/json' `
    -Body (Json @{ apoderadoId = $cuenta.apoderadoId; estudianteId = $estudiante.id; parentesco = 'Padre' }) `
    -WebSession $admin | Out-Null
Ok "apoderado $($cuenta.apoderadoId) vinculado al estudiante $($estudiante.id)"

Paso 'Prepara año, grado y sección'
$catalogos = (Invoke-RestMethod "$Api/admin/catalogos" -WebSession $admin).data
$anio = $catalogos.anios | Where-Object { $_.activo } | Select-Object -First 1
if (-not $anio) { $anio = $catalogos.anios | Select-Object -First 1 }
if (-not $anio) { Mal 'no hay ningún año académico: créalo desde la aplicación' }
$grado = $catalogos.grados | Select-Object -First 1
if (-not $grado) { Mal 'no hay ningún grado: créalo desde la aplicación' }
$seccion = $catalogos.secciones | Where-Object { $_.anioAcademicoId -eq $anio.id } | Select-Object -First 1
if (-not $seccion) { Mal 'no hay ninguna sección en ese año: créala desde la aplicación' }
Ok "año $($anio.codigo), sección $($seccion.id)"

# ------------------------------------------------------------------- US-006
Paso 'US-006: matricular emitiendo el compromiso de pago'
$matricula = (Invoke-RestMethod "$Api/admin/matriculas" -Method Post -ContentType 'application/json' `
        -Body (Json @{
            estudianteId = $estudiante.id
            seccionId    = $seccion.id
            planPago     = @{
                montoPension   = '350.00'
                numeroCuotas   = 10
                diaVencimiento = 10
                mesInicio      = 3
                concepto       = 'Pensión'
            }
        }) -WebSession $admin).data
Ok "matrícula $($matricula.id) creada con su cronograma"

EsperaError 409 'no se puede emitir dos veces el compromiso' {
    Invoke-RestMethod "$Api/matriculas/$($matricula.id)/plan-pago" -Method Post `
        -ContentType 'application/json' `
        -Body (Json @{ montoPension = '350.00'; numeroCuotas = 10; diaVencimiento = 10; mesInicio = 3 }) `
        -WebSession $admin
}

# ------------------------------------------------------------------ US-007A
Paso 'El apoderado cambia su contraseña inicial e inicia sesión'
Invoke-RestMethod "$Api/auth/login" -Method Post -ContentType 'application/json' `
    -Body (Json @{ identificador = "apoderado-$sufijo@sage.local"; contrasena = $claveInicial }) `
    -SessionVariable apoderado | Out-Null
Invoke-RestMethod "$Api/auth/contrasena" -Method Put -ContentType 'application/json' `
    -Body (Json @{ contrasenaActual = $claveInicial; nuevaContrasena = $clave }) `
    -WebSession $apoderado | Out-Null
Invoke-RestMethod "$Api/auth/login" -Method Post -ContentType 'application/json' `
    -Body (Json @{ identificador = "apoderado-$sufijo@sage.local"; contrasena = $clave }) `
    -SessionVariable apoderado | Out-Null
Ok 'apoderado autenticado'

Paso 'US-007A: historial de boletas del apoderado'
$historial = (Invoke-RestMethod "$Api/compromisos-pago?limite=100" -WebSession $apoderado).data
if ($historial.total -ne 10) { Mal "esperaba 10 boletas, llegaron $($historial.total)" }
Ok "$($historial.total) boletas, de $($historial.boletas[-1].periodo) a $($historial.boletas[0].periodo)"
$historial.boletas | Select-Object -First 3 periodo, monto, fechaVencimiento, estado | Format-Table | Out-String | Write-Host

# ------------------------------------------------------------------ US-007B
$boleta = $historial.boletas | Where-Object { $_.estado -ne 'PAGADA' } | Select-Object -First 1
Paso "US-007B: pagar la boleta $($boleta.periodo) por S/ $($boleta.monto)"
$pago = (Invoke-RestMethod "$Api/pagos" -Method Post -ContentType 'application/json' `
        -Body (Json @{ compromisoPagoId = $boleta.id }) -WebSession $apoderado).data
Ok "pago $($pago.pagoId) en estado $($pago.estado)"
Write-Host "   URL de checkout: $($pago.urlCheckout)" -ForegroundColor DarkGray

$antes = (Invoke-RestMethod "$Api/compromisos-pago?limite=100" -WebSession $apoderado).data.boletas |
Where-Object { $_.id -eq $boleta.id }
if ($antes.estado -eq 'PAGADA') { Mal 'la boleta no debería estar pagada antes de la confirmación' }
Ok "la boleta sigue en $($antes.estado) mientras la pasarela no confirme"

EsperaError 409 'no se permite un segundo pago en curso sobre la misma boleta' {
    Invoke-RestMethod "$Api/pagos" -Method Post -ContentType 'application/json' `
        -Body (Json @{ compromisoPagoId = $boleta.id }) -WebSession $apoderado
}

# A partir de aquí el recorrido depende del proveedor configurado en backend/.env.
$esStripe = $pago.urlCheckout -like '*checkout.stripe.com*'

if ($esStripe) {
    Paso 'Completa el pago en la página de Stripe'
    Write-Host '   Se abrirá el navegador. Paga con la tarjeta de prueba:' -ForegroundColor Yellow
    Write-Host '     4242 4242 4242 4242 · cualquier fecha futura · cualquier CVC' -ForegroundColor Yellow
    Write-Host '   Mientras tanto vigila la terminal de stripe listen: ahí verás llegar el evento.' -ForegroundColor DarkGray
    Start-Process $pago.urlCheckout
    $limite = (Get-Date).AddMinutes(5)
    $estado = 'PROCESANDO'
    do {
        Start-Sleep -Seconds 3
        $estado = (Invoke-RestMethod "$Api/pagos/$($pago.pagoId)" -WebSession $apoderado).data.estado
        Write-Host "   esperando confirmación... estado = $estado"
    } while ($estado -eq 'PROCESANDO' -and (Get-Date) -lt $limite)
    if ($estado -ne 'CONFIRMADO') { Mal "el pago quedó en $estado" }
    Ok 'Stripe confirmó el pago y el webhook lo aplicó'
}
else {
    Paso 'La pasarela simulada confirma el pago'
    $confirmacion = (Invoke-RestMethod "$Api/pagos/$($pago.pagoId)/simular" -Method Post `
            -ContentType 'application/json' -Body (Json @{ resultado = 'PAGADO' }) `
            -WebSession $apoderado).data
    if (-not $confirmacion.aplicado) { Mal "la confirmación no se aplicó: $($confirmacion.motivo)" }
    Ok 'confirmación aplicada'
}

$despues = (Invoke-RestMethod "$Api/compromisos-pago?limite=100" -WebSession $apoderado).data.boletas |
Where-Object { $_.id -eq $boleta.id }
if ($despues.estado -ne 'PAGADA') { Mal "la boleta quedó en $($despues.estado)" }
Ok "la boleta pasó a PAGADA el $($despues.pagadaEn)"

if (-not $esStripe) {
    Paso 'QAS008: el reenvío de la misma confirmación no vuelve a aplicarse'
    $reenvio = (Invoke-RestMethod "$Api/pagos/$($pago.pagoId)/simular" -Method Post `
            -ContentType 'application/json' -Body (Json @{ resultado = 'PAGADO' }) `
            -WebSession $apoderado).data
    if ($reenvio.aplicado) { Mal 'el reenvío volvió a aplicar la confirmación' }
    Ok "reenvío ignorado con motivo $($reenvio.motivo)"
}

EsperaError 409 'no se puede volver a pagar una boleta ya pagada' {
    Invoke-RestMethod "$Api/pagos" -Method Post -ContentType 'application/json' `
        -Body (Json @{ compromisoPagoId = $boleta.id }) -WebSession $apoderado
}

$proveedor = if ($esStripe) { 'Stripe (modo prueba)' } else { 'pasarela simulada' }
Write-Host ""
Write-Host "Todo el recorrido de pagos funcionó con $proveedor." -ForegroundColor Green
Write-Host "Cuenta usada: apoderado-$sufijo@sage.local / $clave" -ForegroundColor DarkGray
