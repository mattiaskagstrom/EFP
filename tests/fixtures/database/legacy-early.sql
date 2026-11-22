-- Representative early MVP schema before the startup adjustments in legacy-startup.sql.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE TABLE "Investigations" (
    "Id" uuid PRIMARY KEY,
    "Name" text NOT NULL,
    "Description" text,
    "Status" text NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL
);
CREATE TABLE "Zones" (
    "Id" uuid PRIMARY KEY,
    "InvestigationId" uuid NOT NULL REFERENCES "Investigations" ("Id") ON DELETE CASCADE,
    "Name" text NOT NULL,
    "Instructions" text,
    "Status" text NOT NULL,
    "SearchMethod" text NOT NULL,
    "Priority" integer NOT NULL,
    "AssignedGroup" text,
    "Geometry" geometry(Polygon,4326) NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL
);
CREATE TABLE "Tracks" (
    "Id" uuid PRIMARY KEY,
    "InvestigationId" uuid NOT NULL REFERENCES "Investigations" ("Id") ON DELETE CASCADE,
    "Callsign" text NOT NULL,
    "SourceFile" text,
    "StartedAt" timestamp with time zone,
    "EndedAt" timestamp with time zone,
    "Geometry" geometry(LineString,4326) NOT NULL,
    "ImportedAt" timestamp with time zone NOT NULL
);
CREATE TABLE "ReferencePoints" (
    "Id" uuid PRIMARY KEY,
    "InvestigationId" uuid NOT NULL REFERENCES "Investigations" ("Id") ON DELETE CASCADE,
    "Type" text NOT NULL,
    "Label" text NOT NULL,
    "Geometry" geometry(Point,4326) NOT NULL
);
