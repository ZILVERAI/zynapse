import type { isAssertEntry } from "typescript";
import { APISchema, Service, Procedure } from ".";

const buffer: string = `
import * as React from "react"
import {
  useQuery,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";

`;

function singleProcedureCodeGen(proc: Procedure) {
	const buff: string = "";
	// Generate the top level function
	if (proc.method === "MUTATION") {
		buff += ``;
	}
}

function GenerateServiceCode(service: Service) {
	for (const proc of service.procedures) {
	}
}

export function GenerateCode(schema: APISchema) {
	for (const [key, val] of Object.entries(schema.services)) {
		GenerateServiceCode(val);
	}
}
