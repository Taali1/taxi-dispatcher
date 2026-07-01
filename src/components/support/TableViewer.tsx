import React, { useState, useEffect } from 'react';
import { X, Database, Table, Key, Link, ChevronLeft, ChevronRight } from 'lucide-react';
import { databaseService } from '../../services/databaseService';
import { TableStructure, TableData } from '../../types/database';

interface TableViewerProps {
  tableName: string;
  onClose: () => void;
}

const TableViewer: React.FC<TableViewerProps> = ({ tableName, onClose }) => {
  const [activeTab, setActiveTab] = useState<'structure' | 'data'>('structure');
  const [structure, setStructure] = useState<TableStructure | null>(null);
  const [data, setData] = useState<TableData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTableStructure();
  }, [tableName]);

  useEffect(() => {
    if (activeTab === 'data') {
      loadTableData(currentPage);
    }
  }, [activeTab, currentPage]);

  const loadTableStructure = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const tableStructure = await databaseService.getTableStructure(tableName);
      setStructure(tableStructure);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd podczas ładowania struktury tabeli');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTableData = async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const tableData = await databaseService.getTableData(tableName, page);
      setData(tableData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd podczas ładowania danych tabeli');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const totalPages = data ? Math.ceil(data.totalRows / data.pageSize) : 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center space-x-3">
            <Database className="w-6 h-6 text-blue-400" />
            <div>
              <h2 className="text-xl font-bold text-white">Tabela: {tableName}</h2>
              <p className="text-slate-400 text-sm">Podgląd struktury i zawartości</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors duration-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-slate-700 p-1 mx-6 mt-4 rounded-lg">
          <button
            onClick={() => setActiveTab('structure')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
              activeTab === 'structure'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-600'
            }`}
          >
            <Table className="w-4 h-4" />
            <span>Struktura</span>
          </button>
          
          <button
            onClick={() => setActiveTab('data')}
            className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
              activeTab === 'data'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-600'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>Dane</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-6">
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-slate-400">Ładowanie...</div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded-lg">
              {error}
            </div>
          )}

          {!isLoading && !error && activeTab === 'structure' && structure && (
            <div className="space-y-6">
              {/* Table Info */}
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="text-white font-medium mb-2">Informacje o tabeli</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Nazwa:</span>
                    <span className="text-white ml-2">{structure.tableName}</span>
                  </div>
                  {structure.engine && (
                    <div>
                      <span className="text-slate-400">Silnik:</span>
                      <span className="text-white ml-2">{structure.engine}</span>
                    </div>
                  )}
                  {structure.collation && (
                    <div>
                      <span className="text-slate-400">Kodowanie:</span>
                      <span className="text-white ml-2">{structure.collation}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Columns */}
              <div>
                <h3 className="text-white font-medium mb-3">Kolumny</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="pb-2 text-slate-300 font-medium">Nazwa</th>
                        <th className="pb-2 text-slate-300 font-medium">Typ</th>
                        <th className="pb-2 text-slate-300 font-medium">Null</th>
                        <th className="pb-2 text-slate-300 font-medium">Klucz</th>
                        <th className="pb-2 text-slate-300 font-medium">Domyślna</th>
                        <th className="pb-2 text-slate-300 font-medium">Auto Inc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {structure.columns.map((column) => (
                        <tr key={column.name} className="border-b border-slate-700 last:border-b-0">
                          <td className="py-2 text-white font-medium">{column.name}</td>
                          <td className="py-2 text-slate-300">{column.type}</td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              column.nullable ? 'bg-yellow-600 text-white' : 'bg-red-600 text-white'
                            }`}>
                              {column.nullable ? 'YES' : 'NO'}
                            </span>
                          </td>
                          <td className="py-2">
                            <div className="flex space-x-1">
                              {column.isPrimaryKey && (
                                <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs flex items-center space-x-1">
                                  <Key className="w-3 h-3" />
                                  <span>PK</span>
                                </span>
                              )}
                              {column.isForeignKey && (
                                <span className="bg-purple-600 text-white px-2 py-1 rounded text-xs flex items-center space-x-1">
                                  <Link className="w-3 h-3" />
                                  <span>FK</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 text-slate-300">{column.defaultValue || '--'}</td>
                          <td className="py-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              column.autoIncrement ? 'bg-green-600 text-white' : 'bg-slate-600 text-white'
                            }`}>
                              {column.autoIncrement ? 'YES' : 'NO'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Indexes */}
              {structure.indexes.length > 0 && (
                <div>
                  <h3 className="text-white font-medium mb-3">Indeksy</h3>
                  <div className="space-y-2">
                    {structure.indexes.map((index) => (
                      <div key={index.name} className="bg-slate-700 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="text-white font-medium">{index.name}</span>
                            {index.isPrimary && (
                              <span className="bg-blue-600 text-white px-2 py-1 rounded text-xs">PRIMARY</span>
                            )}
                            {index.isUnique && !index.isPrimary && (
                              <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">UNIQUE</span>
                            )}
                          </div>
                          <div className="text-slate-300 text-sm">
                            Kolumny: {index.columns.join(', ')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Foreign Keys */}
              {structure.foreignKeys.length > 0 && (
                <div>
                  <h3 className="text-white font-medium mb-3">Klucze obce</h3>
                  <div className="space-y-2">
                    {structure.foreignKeys.map((fk) => (
                      <div key={fk.name} className="bg-slate-700 rounded-lg p-3">
                        <div className="text-white font-medium mb-1">{fk.name}</div>
                        <div className="text-sm text-slate-300">
                          {fk.column} → {fk.referencedTable}.{fk.referencedColumn}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          ON DELETE {fk.onDelete} | ON UPDATE {fk.onUpdate}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isLoading && !error && activeTab === 'data' && data && (
            <div className="space-y-4">
              {/* Data Info */}
              <div className="flex justify-between items-center">
                <div className="text-slate-300">
                  Wyświetlanie {((data.currentPage - 1) * data.pageSize) + 1}-{Math.min(data.currentPage * data.pageSize, data.totalRows)} z {data.totalRows} wierszy
                </div>
                
                {/* Pagination */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white px-3 py-1 rounded text-sm transition-colors duration-200"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Poprzednia</span>
                  </button>
                  
                  <span className="text-slate-300 text-sm">
                    Strona {currentPage} z {totalPages}
                  </span>
                  
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="flex items-center space-x-1 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500 text-white px-3 py-1 rounded text-sm transition-colors duration-200"
                  >
                    <span>Następna</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-700">
                    <tr>
                      {data.columns.map((column) => (
                        <th key={column} className="px-3 py-2 text-slate-300 font-medium border-b border-slate-600">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-700/50">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="px-3 py-2 text-slate-300">
                            {cell === null ? (
                              <span className="text-slate-500 italic">NULL</span>
                            ) : (
                              <span className="text-white">{String(cell)}</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TableViewer;