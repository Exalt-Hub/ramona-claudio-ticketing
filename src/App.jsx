// ======================================================
// RAMONA & CLAUDIO - LUXURY CODE GENERATED TICKET
// ======================================================

const PDF_W = 210;
const PDF_H = 99;

let coupleImageCache = undefined;


// ------------------------------------------------------
// Optionele foto van Ramona & Claudio laden
// Zet deze als: public/couple.png
// ------------------------------------------------------

async function getCoupleImage(){

  if(coupleImageCache !== undefined){
    return coupleImageCache;
  }

  try{

    const response = await fetch('/couple.png');

    if(!response.ok){
      coupleImageCache = null;
      return null;
    }

    const blob = await response.blob();

    coupleImageCache = await new Promise(
      (resolve,reject)=>{

        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;

        reader.readAsDataURL(blob);
      }
    );

    return coupleImageCache;

  }catch(error){

    console.warn('couple.png niet gevonden',error);

    coupleImageCache = null;

    return null;
  }
}


// ------------------------------------------------------
// Eén ticket downloaden
// ------------------------------------------------------

async function ticketPdf(ticket,settings){

  try{

    const pdf = new jsPDF({
      orientation:'landscape',
      unit:'mm',
      format:[PDF_W,PDF_H]
    });


    await drawRamonaTicket(
      pdf,
      ticket,
      settings
    );


    pdf.save(
      `${ticket.ticketNumber}.pdf`
    );

  }catch(error){

    console.error(error);

    alert(
      'De ticket PDF kon niet worden gemaakt.'
    );
  }
}


// ------------------------------------------------------
// Alle tickets in één PDF
// ------------------------------------------------------

async function batchPdf(tickets,settings){

  if(!tickets.length){
    return;
  }


  try{

    const pdf = new jsPDF({
      orientation:'landscape',
      unit:'mm',
      format:[PDF_W,PDF_H]
    });


    for(
      let i=0;
      i<tickets.length;
      i++
    ){

      if(i > 0){

        pdf.addPage(
          [PDF_W,PDF_H],
          'landscape'
        );
      }


      await drawRamonaTicket(
        pdf,
        tickets[i],
        settings
      );
    }


    pdf.save(
      'Ramona-Claudio-Tickets.pdf'
    );

  }catch(error){

    console.error(error);

    alert(
      'De tickets konden niet worden gemaakt.'
    );
  }
}


// ------------------------------------------------------
// HOOFD TICKET DESIGN
// ------------------------------------------------------

async function drawRamonaTicket(
  pdf,
  ticket,
  settings
){

  const blush = [249,232,228];
  const blushLight = [255,247,244];

  const rose = [181,116,107];

  const gold = [183,137,56];
  const goldLight = [226,194,122];

  const black = [20,17,16];
  const blackSoft = [34,28,25];

  const text = [46,36,31];


  // ====================================================
  // ACHTERGROND
  // ====================================================

  pdf.setFillColor(
    ...blushLight
  );

  pdf.rect(
    0,
    0,
    PDF_W,
    PDF_H,
    'F'
  );


  // Ticket shadow

  pdf.setFillColor(
    230,
    219,
    213
  );

  pdf.roundedRect(
    4.5,
    5.5,
    201,
    89,
    3,
    3,
    'F'
  );


  // Ticket body

  pdf.setFillColor(
    ...blush
  );

  pdf.roundedRect(
    3,
    4,
    201,
    89,
    3,
    3,
    'F'
  );


  // ====================================================
  // DECORATIEVE ZWARTE HOEKEN
  // ====================================================

  pdf.setFillColor(
    ...black
  );


  // linksboven

  pdf.triangle(
    3,
    4,

    48,
    4,

    3,
    31,

    'F'
  );


  // linksonder

  pdf.triangle(
    3,
    93,

    54,
    93,

    3,
    69,

    'F'
  );


  // rechtsonder

  pdf.triangle(
    204,
    93,

    180,
    93,

    204,
    74,

    'F'
  );


  // ====================================================
  // GOUDEN RANDEN
  // ====================================================

  pdf.setDrawColor(
    ...gold
  );

  pdf.setLineWidth(
    0.45
  );


  pdf.roundedRect(
    6,
    7,
    195,
    83,
    2,
    2
  );


  pdf.setDrawColor(
    ...goldLight
  );

  pdf.setLineWidth(
    0.2
  );


  pdf.roundedRect(
    8,
    9,
    191,
    79,
    1.5,
    1.5
  );


  // ====================================================
  // PERFORATIELIJN
  // ====================================================

  const stubX = 154;


  pdf.setDrawColor(
    85,
    75,
    68
  );


  pdf.setLineDashPattern(
    [1.5,1.4],
    0
  );


  pdf.line(
    stubX,
    5,
    stubX,
    92
  );


  pdf.setLineDashPattern(
    [],
    0
  );


  // ====================================================
  // DECORATIEVE SPARKLES
  // ====================================================

  drawSpark(
    pdf,
    14,
    15,
    gold
  );

  drawSpark(
    pdf,
    25,
    10,
    goldLight
  );

  drawSpark(
    pdf,
    144,
    18,
    gold
  );

  drawSpark(
    pdf,
    198,
    19,
    gold
  );


  // ====================================================
  // BLOEMEN DECORATIE
  // ====================================================

  drawFlower(
    pdf,
    17,
    81,
    10,
    [221,160,157],
    gold
  );


  drawFlower(
    pdf,
    29,
    86,
    7,
    [236,190,184],
    gold
  );


  drawFlower(
    pdf,
    143,
    82,
    8,
    [220,157,155],
    gold
  );


  // ====================================================
  // FOTO RAMONA & CLAUDIO
  // ====================================================

  const couple =
    await getCoupleImage();


  if(couple){

    try{

      pdf.addImage(
        couple,
        'PNG',

        7,
        14,

        49,
        69,

        undefined,

        'FAST'
      );

    }catch(error){

      console.warn(
        'couple.png kon niet geladen worden',
        error
      );
    }

  }


  // ====================================================
  // UITNODIGING
  // ====================================================

  pdf.setTextColor(
    ...gold
  );


  pdf.setFont(
    'times',
    'italic'
  );


  pdf.setFontSize(
    24
  );


  pdf.text(
    'Uitnodiging',

    101,
    20,

    {
      align:'center'
    }
  );


  // ornament

  pdf.setDrawColor(
    ...gold
  );

  pdf.setLineWidth(
    .3
  );


  pdf.line(
    84,
    24,
    94,
    24
  );


  pdf.line(
    108,
    24,
    118,
    24
  );


  pdf.circle(
    101,
    24,
    1
  );


  // ====================================================
  // NAAM BLACK GOLD PLAQUE
  // ====================================================

  pdf.setFillColor(
    ...black
  );


  pdf.roundedRect(
    62,
    27,
    78,
    15,
    2,
    2,
    'F'
  );


  pdf.setDrawColor(
    ...gold
  );

  pdf.setLineWidth(
    .5
  );


  pdf.roundedRect(
    63,
    28,
    76,
    13,
    1.5,
    1.5
  );


  pdf.setTextColor(
    ...goldLight
  );


  pdf.setFont(
    'times',
    'bold'
  );


  pdf.setFontSize(
    15
  );


  pdf.text(
    settings.names || EVENT.names,

    101,
    37,

    {
      align:'center'
    }
  );


  // ====================================================
  // 43 & 45 CELEBRATION
  // ====================================================

  pdf.setTextColor(
    ...blackSoft
  );


  pdf.setFont(
    'times',
    'italic'
  );


  pdf.setFontSize(
    13
  );


  pdf.text(
    '43 & 45 Celebration',

    101,
    49,

    {
      align:'center'
    }
  );


  // ====================================================
  // EVENT DETAILS
  // ====================================================

  const labelX = 76;

  const valueX = 82;


  drawDetailLine(
    pdf,

    labelX,
    valueX,

    57,

    'DATUM',

    'Vrijdag 18 September 2026',

    gold,
    text
  );


  drawDetailLine(
    pdf,

    labelX,
    valueX,

    64,

    'TIJD',

    'Inloop vanaf 19.00 u',

    gold,
    text
  );


  drawDetailLine(
    pdf,

    labelX,
    valueX,

    71,

    'LOCATIE',

    settings.location || EVENT.location,

    gold,
    text
  );


  drawDetailLine(
    pdf,

    labelX,
    valueX,

    78,

    'DRESSCODE',

    settings.dresscode || EVENT.dresscode,

    gold,
    text
  );


  // ====================================================
  // GASTNAAM
  // ====================================================

  if(ticket.guestName){

    pdf.setTextColor(
      ...text
    );

    pdf.setFont(
      'helvetica',
      'bold'
    );

    pdf.setFontSize(
      7.5
    );


    pdf.text(
      ticket.guestName,

      103,
      84,

      {
        align:'center'
      }
    );
  }


  // ====================================================
  // STANDARD TICKET
  // ====================================================

  pdf.setFillColor(
    ...black
  );


  pdf.roundedRect(
    68,
    84.5,

    66,
    9,

    2,
    2,

    'F'
  );


  pdf.setDrawColor(
    ...gold
  );


  pdf.roundedRect(
    69,
    85.5,

    64,
    7,

    1.4,
    1.4
  );


  pdf.setTextColor(
    ...goldLight
  );


  pdf.setFont(
    'times',
    'bold'
  );


  pdf.setFontSize(
    9.5
  );


  pdf.text(
    'STANDARD TICKET',

    101,
    91,

    {
      align:'center'
    }
  );


  // ====================================================
  // RECHTER STUB
  // ====================================================

  pdf.setFillColor(
    251,
    232,
    227
  );


  pdf.roundedRect(
    157,
    9,

    42,
    79,

    2,
    2,

    'F'
  );


  pdf.setDrawColor(
    ...gold
  );


  pdf.setLineWidth(
    .45
  );


  pdf.roundedRect(
    158.5,
    10.5,

    39,
    76,

    1.7,
    1.7
  );


  // ====================================================
  // SCAN LABEL
  // ====================================================

  pdf.setTextColor(
    ...blackSoft
  );


  pdf.setFont(
    'times',
    'bold'
  );


  pdf.setFontSize(
    8
  );


  pdf.text(
    'SCAN FOR ENTRY',

    178,
    19,

    {
      align:'center'
    }
  );


  // ====================================================
  // QR FRAME
  // ====================================================

  pdf.setFillColor(
    255,
    255,
    255
  );


  pdf.setDrawColor(
    ...gold
  );


  pdf.setLineWidth(
    .6
  );


  pdf.roundedRect(
    163,
    24,

    30,
    30,

    2,
    2,

    'FD'
  );


  // QR genereren

  const qr =
    await QRCode.toDataURL(

      payload(ticket),

      {
        errorCorrectionLevel:'H',
        margin:1,
        width:900,

        color:{
          dark:'#000000',
          light:'#FFFFFF'
        }
      }
    );


  pdf.addImage(
    qr,
    'PNG',

    165,
    26,

    26,
    26
  );


  // ====================================================
  // ONE TIME ENTRY
  // ====================================================

  pdf.setTextColor(
    ...blackSoft
  );


  pdf.setFont(
    'times',
    'bold'
  );


  pdf.setFontSize(
    7.5
  );


  pdf.text(
    'ONE-TIME ENTRY',

    178,
    62,

    {
      align:'center'
    }
  );


  pdf.setDrawColor(
    ...gold
  );


  pdf.line(
    168,
    66,
    175,
    66
  );


  pdf.circle(
    178,
    66,
    .9
  );


  pdf.line(
    181,
    66,
    188,
    66
  );


  // ====================================================
  // TICKET NO BLACK GOLD PLAQUE
  // ====================================================

  pdf.setFillColor(
    ...black
  );


  pdf.roundedRect(
    162,
    71,

    32,
    16,

    2,
    2,

    'F'
  );


  pdf.setDrawColor(
    ...gold
  );


  pdf.roundedRect(
    163,
    72,

    30,
    14,

    1.5,
    1.5
  );


  pdf.setTextColor(
    ...goldLight
  );


  pdf.setFont(
    'times',
    'bold'
  );


  pdf.setFontSize(
    5.5
  );


  pdf.text(
    'TICKET NO.',

    178,
    77,

    {
      align:'center'
    }
  );


  pdf.setFontSize(
    12
  );


  pdf.text(
    ticket.ticketNumber,

    178,
    84,

    {
      align:'center'
    }
  );
}


// ======================================================
// DETAIL LINE
// ======================================================

function drawDetailLine(
  pdf,
  labelX,
  valueX,
  y,
  label,
  value,
  gold,
  text
){

  pdf.setTextColor(
    ...gold
  );


  pdf.setFont(
    'helvetica',
    'bold'
  );


  pdf.setFontSize(
    5.5
  );


  pdf.text(
    label,

    labelX,
    y
  );


  pdf.setTextColor(
    ...text
  );


  pdf.setFont(
    'times',
    'normal'
  );


  pdf.setFontSize(
    7.2
  );


  pdf.text(
    value,

    valueX,
    y
  );
}


// ======================================================
// SPARKLE
// ======================================================

function drawSpark(
  pdf,
  x,
  y,
  gold
){

  pdf.setDrawColor(
    ...gold
  );


  pdf.setLineWidth(
    .35
  );


  pdf.line(
    x-2,
    y,

    x+2,
    y
  );


  pdf.line(
    x,
    y-2,

    x,
    y+2
  );


  pdf.circle(
    x,
    y,
    .5
  );
}


// ======================================================
// FLOWER
// ======================================================

function drawFlower(
  pdf,
  x,
  y,
  radius,
  rose,
  gold
){

  pdf.setFillColor(
    ...rose
  );


  for(
    let i=0;
    i<8;
    i++
  ){

    const angle=
      (
        Math.PI*2
        /
        8
      )
      *
      i;


    const px=
      x
      +
      Math.cos(angle)
      *
      radius
      *
      .42;


    const py=
      y
      +
      Math.sin(angle)
      *
      radius
      *
      .42;


    pdf.ellipse(
      px,
      py,

      radius*.34,
      radius*.18,

      'F'
    );
  }


  pdf.setFillColor(
    ...gold
  );


  pdf.circle(
    x,
    y,

    radius*.16,

    'F'
  );
}
