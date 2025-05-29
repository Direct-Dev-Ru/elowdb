import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEST_DATA_IMPORT = "import { TestData } from '../../common/interfaces/test-data.js'"

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8')
    
    // Проверяем, есть ли уже импорт TestData
    if (content.includes(TEST_DATA_IMPORT)) {
        // Если импорт есть, просто удаляем локальное определение
        const updatedContent = content.replace(/interface TestData {[^}]*}/g, '')
        fs.writeFileSync(filePath, updatedContent)
    } else {
        // Если импорта нет, добавляем его и удаляем локальное определение
        const importIndex = content.indexOf('import')
        if (importIndex !== -1) {
            const newContent = 
                content.slice(0, importIndex) +
                TEST_DATA_IMPORT + '\n' +
                content.slice(importIndex).replace(/interface TestData {[^}]*}/g, '')
            fs.writeFileSync(filePath, newContent)
        }
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir)
    
    files.forEach(file => {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)
        
        if (stat.isDirectory()) {
            walkDir(filePath)
        } else if (file.endsWith('.test.ts') || file.endsWith('.spec.ts') || file.endsWith('.vi.test.ts')) {
            processFile(filePath)
        }
    })
}

// Начинаем с директории src
walkDir(path.join(__dirname, '../src')) 