import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export async function generatePDF(htmlContent: string, fileName: string = 'document.pdf') {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px'; // Standard width for clarity
  container.style.padding = '40px';
  container.style.backgroundColor = 'white';
  container.style.color = '#1a1a1a';
  container.style.fontFamily = 'serif';
  container.innerHTML = `
    <style>
      h1 { font-size: 24pt; color: #1a1a1a; margin-bottom: 20px; border-bottom: 2px solid #ef4444; padding-bottom: 10px; }
      h2 { font-size: 18pt; color: #374151; margin-top: 30px; margin-bottom: 15px; }
      p { font-size: 11pt; line-height: 1.6; color: #4b5563; margin-bottom: 10px; }
      ul, ol { margin-left: 20px; margin-bottom: 15px; }
      li { margin-bottom: 5px; color: #4b5563; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; }
      th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
      th { background-color: #f9fafb; font-weight: bold; }
      .footer { margin-top: 50px; font-size: 9pt; color: #9ca3af; text-align: center; border-top: 1px id #f3f4f6; padding-top: 10px; }
    </style>
    ${htmlContent}
    <div class="footer">Gerado por OSONE v3 Inteligence Systems - ${new Date().toLocaleDateString()}</div>
  `;
  
  document.body.appendChild(container);
  
  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [canvas.width / 2, canvas.height / 2]
    });
    
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(fileName);
  } catch (error) {
    console.error('PDF Generation Error:', error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
}
