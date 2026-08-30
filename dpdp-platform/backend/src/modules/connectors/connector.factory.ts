import { Injectable } from "@nestjs/common";
import type { AuthType } from "@prisma/client";
import type { Connector } from "./connector.interface";
import {
  RestApiConnector,
  type RestApiConnectorConfig,
} from "./rest-api.connector";

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
 * Builds a `Connector` for a data source. MVP1 ships exactly one
 * implementation, `RestApiConnector`, and this factory is the single call
 * site Task 12 (and the sync pipeline) should use instead of constructing
 * `RestApiConnector` directly, so a future connector type has one place to
 * be wired in. Note this does NOT currently dispatch on `systemType` --
 * `DataSourceRowForConnector` doesn't carry it, because there is nothing to
 * dispatch to yet. A second connector type would need to add `systemType`
 * (or similar) to this interface and branch on it here.
 */
@Injectable()
export class ConnectorFactory {
  create(
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
