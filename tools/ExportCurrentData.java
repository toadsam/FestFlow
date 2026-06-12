import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

public class ExportCurrentData {

    private static final String DEFAULT_URL =
            "jdbc:mysql://localhost:3306/festival_db?useSSL=false&serverTimezone=Asia/Seoul&allowPublicKeyRetrieval=true";
    private static final String DEFAULT_USERNAME = "root";
    private static final String DEFAULT_PASSWORD = "6247";
    private static final List<String> TABLE_EXCLUDE_PREFIXES = List.of("sys_", "qrtz_");

    public static void main(String[] args) throws Exception {
        String jdbcUrl = envOrDefault("SPRING_DATASOURCE_URL_LOCAL", DEFAULT_URL);
        String username = envOrDefault("SPRING_DATASOURCE_USERNAME_LOCAL", DEFAULT_USERNAME);
        String password = envOrDefault("SPRING_DATASOURCE_PASSWORD_LOCAL", DEFAULT_PASSWORD);
        Path outputDir = Path.of("exports", "current-db-csv");

        Files.createDirectories(outputDir);

        try (Connection connection = DriverManager.getConnection(jdbcUrl, username, password)) {
            List<String> tables = listTables(connection);
            if (tables.isEmpty()) {
                System.out.println("No tables found.");
                return;
            }

            int exported = 0;
            for (String table : tables) {
                exportTable(connection, table, outputDir.resolve(table + ".csv"));
                exported += 1;
            }
            System.out.println("Exported " + exported + " tables to " + outputDir.toAbsolutePath());
        }
    }

    private static String envOrDefault(String key, String fallback) {
        String value = System.getenv(key);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static List<String> listTables(Connection connection) throws SQLException {
        DatabaseMetaData metaData = connection.getMetaData();
        List<String> tables = new ArrayList<>();
        try (ResultSet rs = metaData.getTables(connection.getCatalog(), null, "%", new String[]{"TABLE"})) {
            while (rs.next()) {
                String tableName = rs.getString("TABLE_NAME");
                if (shouldSkip(tableName)) {
                    continue;
                }
                tables.add(tableName);
            }
        }
        tables.sort(String::compareToIgnoreCase);
        return tables;
    }

    private static boolean shouldSkip(String tableName) {
        if (tableName == null || tableName.isBlank()) {
            return true;
        }
        String normalized = tableName.toLowerCase();
        if (normalized.equals("flyway_schema_history")) {
            return true;
        }
        for (String prefix : TABLE_EXCLUDE_PREFIXES) {
            if (normalized.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    private static void exportTable(Connection connection, String tableName, Path outputFile)
            throws SQLException, IOException {
        try (
                Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery("select * from `" + tableName + "`");
                BufferedWriter writer = Files.newBufferedWriter(outputFile, StandardCharsets.UTF_8)
        ) {
            ResultSetMetaData metaData = rs.getMetaData();
            int columnCount = metaData.getColumnCount();

            for (int column = 1; column <= columnCount; column++) {
                if (column > 1) {
                    writer.write(",");
                }
                writer.write(escapeCsv(metaData.getColumnLabel(column)));
            }
            writer.newLine();

            while (rs.next()) {
                for (int column = 1; column <= columnCount; column++) {
                    if (column > 1) {
                        writer.write(",");
                    }
                    Object value = rs.getObject(column);
                    writer.write(escapeCsv(value == null ? "" : String.valueOf(value)));
                }
                writer.newLine();
            }
        }
    }

    private static String escapeCsv(String value) {
        String escaped = value.replace("\"", "\"\"");
        return "\"" + escaped + "\"";
    }
}
