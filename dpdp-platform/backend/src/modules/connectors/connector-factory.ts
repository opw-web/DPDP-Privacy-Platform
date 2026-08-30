import type { AuthType } from "@prisma/client";
import type { Connector } from "./connector.interface";
import {
  RestApiConnector,
  type RestApiConnectorConfig,
} from "./rest-api-connector";

/**
 * The subset of a `DataSource` Prisma row this factory needs. Deliberately
 * excludes `credentialCipher` -- Task 12 decrypts that column itself and
 * passes the plaintext in separately as `decryptedCredential`. This factory
 * (and everything downstream of it) never touches the cipher column or the
 * database.
 */
export interface DataSourceRowForConnector {
  name: string;
  baseUrl: string;
  recordsPath: string;
  externalIdField: string;
  authType: AuthType;
  paginationStyle: string;
  pageSize: number;
  supportsIncremental: boolean;
  incrementalParam: string | null;
}

/**
 * Builds a `Connector` for a data source. MVP1 has exactly one `systemType` ->
 * `RestApiConnector` mapping; this indirection exists so Task 12 (and later,
 * additional connector types) has one call site to build from instead of
 * reaching into `RestApiConnector` directly.
 */
export class ConnectorFactory {
  static create(
    dataSource: DataSourceRowForConnector,
    decryptedCredential: string | null,
  ): Connector {
    const config: RestApiConnectorConfig = {
      name: dataSource.name,
      baseUrl: dataSource.baseUrl,
      recordsPath: dataSource.recordsPath,
      externalIdField: dataSource.externalIdField,
      authType: dataSource.authType,
      credential: decryptedCredential,
      paginationStyle: dataSource.paginationStyle,
      pageSize: dataSource.pageSize,
      supportsIncremental: dataSource.supportsIncremental,
      incrementalParam: dataSource.incrementalParam,
    };
    return new RestApiConnector(config);
  }
}
