INSERT INTO "BimestreAcademico" ("anioAcademicoId", "numero", "nombre")
SELECT a."id", b."numero", b."nombre"
FROM "AnioAcademico" a
CROSS JOIN (VALUES
  (1, 'I Bimestre'),
  (2, 'II Bimestre'),
  (3, 'III Bimestre'),
  (4, 'IV Bimestre')
) AS b("numero", "nombre")
WHERE NOT EXISTS (
  SELECT 1
  FROM "BimestreAcademico" existing
  WHERE existing."anioAcademicoId" = a."id"
    AND existing."numero" = b."numero"
);
